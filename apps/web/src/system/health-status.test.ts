import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkDatabaseHealth } from "../db/health.ts";
import { describeHealth, describeHealthError } from "./health-status.ts";

const ok = (rows: Array<Record<string, unknown>>) => async () => ({ rows });

describe("describeHealth", () => {
  it("reports a connected database with the applied migrations count", async () => {
    const result = await checkDatabaseHealth(async (sql) =>
      sql.startsWith("select count")
        ? { rows: [{ count: "3" }] }
        : { rows: [{ "?column?": 1 }] },
    );
    assert.deepEqual(describeHealth(result), {
      tone: "ok",
      summary: "Base de datos conectada",
      detail: "3 migraciones aplicadas",
    });
  });

  it("uses the singular for a single migration", async () => {
    const result = await checkDatabaseHealth(async (sql) =>
      sql.startsWith("select count")
        ? { rows: [{ count: "1" }] }
        : { rows: [] },
    );
    assert.equal(describeHealth(result).detail, "1 migración aplicada");
  });

  it("reports an unreachable database without leaking error text", async () => {
    const result = await checkDatabaseHealth(async () => {
      throw new Error("password authentication failed for user hachisky");
    });
    const view = describeHealth(result);
    assert.equal(view.tone, "error");
    assert.equal(view.summary, "Base de datos sin conexión");
    assert.doesNotMatch(JSON.stringify(view), /password|hachisky/);
  });

  it("reports pending migrations", async () => {
    const result = await checkDatabaseHealth(async (sql) =>
      sql.startsWith("select count")
        ? { rows: [{ count: "0" }] }
        : { rows: [] },
    );
    const view = describeHealth(result);
    assert.equal(view.tone, "error");
    assert.equal(view.detail, "Migraciones pendientes");
  });

  it("reports an unreadable migration state", async () => {
    const result = await checkDatabaseHealth(async (sql) => {
      if (sql.startsWith("select count")) throw new Error("boom");
      return ok([])();
    });
    const view = describeHealth(result);
    assert.equal(view.tone, "error");
    assert.equal(view.detail, "No se pudo leer el estado de las migraciones");
  });
});

describe("failures inside the query callback", () => {
  it("maps a getPool() failure (e.g. invalid configuration) to database_unavailable without leaking it", async () => {
    // SystemStatus builds the pool inside the callback, so an invalid
    // configuration throws there and checkDatabaseHealth reports it as an
    // unreachable database, not as a separate "missing configuration" state.
    const result = await checkDatabaseHealth(() => {
      throw new Error("Invalid environment configuration: PGPASSWORD");
    });
    assert.equal(result.failure, "database_unavailable");
    const view = describeHealth(result);
    assert.equal(view.tone, "error");
    assert.equal(view.summary, "Base de datos sin conexión");
    assert.doesNotMatch(JSON.stringify(view), /PGPASSWORD|Invalid environment/);
  });
});

describe("describeHealthError", () => {
  it("maps an unexpected failure of the check itself to a safe error view", () => {
    const view = describeHealthError();
    assert.equal(view.tone, "error");
    assert.equal(view.summary, "Base de datos sin conexión");
    assert.equal(view.detail, "No se pudo comprobar el estado");
  });
});
