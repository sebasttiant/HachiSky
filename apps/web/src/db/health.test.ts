import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDatabaseHealth, type HealthQuery } from "./health.ts";

test("checkDatabaseHealth returns 503 database unavailable when select 1 fails", async () => {
  const query: HealthQuery = async (sql) => {
    if (sql.includes("select 1")) {
      throw new Error("connection refused");
    }
    return { rows: [{ count: "1" }] };
  };

  const result = await checkDatabaseHealth(query);

  assert.equal(result.httpStatus, 503);
  assert.deepEqual(result.body, { status: "error", database: "unavailable" });
  assert.equal(result.failure, "database_unavailable");
});

test("checkDatabaseHealth returns 503 migrations unavailable when the count query fails", async () => {
  const query: HealthQuery = async (sql) => {
    if (sql.includes("select 1")) {
      return { rows: [] };
    }
    throw new Error("relation drizzle.__drizzle_migrations does not exist");
  };

  const result = await checkDatabaseHealth(query);

  assert.equal(result.httpStatus, 503);
  assert.deepEqual(result.body, {
    status: "error",
    database: "ok",
    migrations: "unavailable",
  });
  assert.equal(result.failure, "migrations_unavailable");
});

test("checkDatabaseHealth returns 503 migrations pending when the count is zero", async () => {
  const query: HealthQuery = async (sql) => {
    if (sql.includes("select 1")) {
      return { rows: [] };
    }
    return { rows: [{ count: "0" }] };
  };

  const result = await checkDatabaseHealth(query);

  assert.equal(result.httpStatus, 503);
  assert.deepEqual(result.body, {
    status: "error",
    database: "ok",
    migrations: "pending",
  });
  assert.equal(result.failure, "migrations_pending");
});

test("checkDatabaseHealth returns 200 ok when migrations are applied", async () => {
  const query: HealthQuery = async (sql) => {
    if (sql.includes("select 1")) {
      return { rows: [] };
    }
    return { rows: [{ count: "3" }] };
  };

  const result = await checkDatabaseHealth(query);

  assert.equal(result.httpStatus, 200);
  assert.deepEqual(result.body, {
    status: "ok",
    database: "ok",
    migrations: 3,
  });
  assert.equal(result.failure, undefined);
});

test("checkDatabaseHealth never leaks error details into the response body", async () => {
  const query: HealthQuery = async (sql) => {
    if (sql.includes("select 1")) {
      return { rows: [] };
    }
    throw new Error(
      "SELECT secret_column FROM users WHERE password=hunter2-fake",
    );
  };

  const result = await checkDatabaseHealth(query);
  const serialized = JSON.stringify(result.body);

  assert.ok(!serialized.includes("SELECT secret_column"));
  assert.ok(!serialized.includes("password=hunter2-fake"));
});
