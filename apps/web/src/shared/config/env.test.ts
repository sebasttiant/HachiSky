import assert from "node:assert/strict";
import { test } from "node:test";
import { type EnvSource, loadEnv } from "./env.ts";

const VALID: EnvSource = {
  APP_ENV: "test",
  PGHOST: "db-test",
  PGPORT: "5432",
  PGDATABASE: "hachisky_test",
  PGUSER: "hachisky_test",
  PGPASSWORD: "hachisky_test_disposable",
};

test("loadEnv parses a valid environment", () => {
  const env = loadEnv(VALID);
  assert.equal(env.APP_ENV, "test");
  assert.equal(env.PGHOST, "db-test");
  assert.equal(env.PGPORT, 5432);
  assert.equal(env.PGDATABASE, "hachisky_test");
  assert.equal(env.PGUSER, "hachisky_test");
  assert.equal(env.PGPASSWORD, "hachisky_test_disposable");
});

test("loadEnv defaults PGPORT to 5432 when absent", () => {
  const { PGPORT: _omit, ...rest } = VALID;
  const env = loadEnv(rest);
  assert.equal(env.PGPORT, 5432);
});

test("loadEnv throws and names the missing key when PGPASSWORD is absent", () => {
  const { PGPASSWORD: _omit, ...rest } = VALID;
  assert.throws(
    () => loadEnv(rest),
    (error: unknown) =>
      error instanceof Error && error.message.includes("PGPASSWORD"),
  );
});

test("loadEnv throws and names the key when APP_ENV is invalid", () => {
  const invalid = { ...VALID, APP_ENV: "staging" };
  assert.throws(
    () => loadEnv(invalid),
    (error: unknown) =>
      error instanceof Error && error.message.includes("APP_ENV"),
  );
});

test("loadEnv error message never contains the password value", () => {
  const secret = "super-secret-do-not-leak-9f3a";
  const invalid = { ...VALID, APP_ENV: "staging", PGPASSWORD: secret };
  assert.throws(
    () => loadEnv(invalid),
    (error: unknown) =>
      error instanceof Error && !error.message.includes(secret),
  );
});
