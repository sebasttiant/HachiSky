import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { buildMigrationPoolConfig, buildPoolConfig } from "./client.ts";
import { checkDatabaseHealth } from "./health.ts";

const env = {
  APP_ENV: "test" as const,
  PGHOST: "localhost",
  PGPORT: 5432,
  PGDATABASE: "db",
  PGUSER: "user",
  PGPASSWORD: "secret-value",
};

describe("buildMigrationPoolConfig", () => {
  it("keeps a connect timeout but sets no query or statement timeout", () => {
    const config = buildMigrationPoolConfig(env);
    assert.equal(config.connectionTimeoutMillis, 2000);
    assert.equal(config.query_timeout, undefined);
    assert.equal(config.statement_timeout, undefined);
    assert.equal(config.host, "localhost");
    assert.equal(config.password, "secret-value");
  });
});

describe("buildPoolConfig", () => {
  it("sets explicit connection, query, statement and idle limits", () => {
    const config = buildPoolConfig(env);
    assert.equal(config.connectionTimeoutMillis, 2000);
    assert.equal(config.query_timeout, 4000);
    assert.equal(config.statement_timeout, 4000);
    assert.equal(config.idleTimeoutMillis, 30000);
    assert.equal(config.max, 5);
  });

  it("uses discrete fields and never a connection string", () => {
    const config = buildPoolConfig(env);
    assert.equal(config.host, "localhost");
    assert.equal(config.password, "secret-value");
    assert.equal("connectionString" in config, false);
  });
});

describe("pool limits against an unresponsive server", () => {
  it("resolves the health check as database_unavailable within the limit", async () => {
    // Accepts TCP but never answers the Postgres handshake.
    const sockets = new Set<net.Socket>();
    const server = net.createServer((s) => {
      sockets.add(s);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as net.AddressInfo;
    const pool = new Pool(
      buildPoolConfig({ ...env, PGHOST: "127.0.0.1", PGPORT: port }),
    );
    const started = Date.now();
    try {
      const result = await checkDatabaseHealth((sql) => pool.query(sql));
      assert.equal(result.failure, "database_unavailable");
      assert.ok(Date.now() - started < 6000, "must resolve within the limit");
    } finally {
      await pool.end().catch(() => {});
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    }
  });
});
