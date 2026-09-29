import assert from "node:assert/strict";
import { test } from "node:test";
import { type EnvSource, loadAuthEnv, loadEnv } from "./env.ts";

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

const AUTH_SECRET = "test-only-secret-0123456789abcdef-0123456789";

const VALID_AUTH: EnvSource = {
  APP_ENV: "development",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: AUTH_SECRET,
};

test("loadAuthEnv parses a valid development environment", () => {
  const env = loadAuthEnv(VALID_AUTH);
  assert.equal(env.APP_ENV, "development");
  assert.equal(env.BETTER_AUTH_URL, "http://localhost:3100");
  assert.equal(env.BETTER_AUTH_SECRET, AUTH_SECRET);
});

test("loadAuthEnv accepts production only over https", () => {
  const env = loadAuthEnv({
    ...VALID_AUTH,
    APP_ENV: "production",
    BETTER_AUTH_URL: "https://hachisky.example.test",
  });
  assert.equal(env.BETTER_AUTH_URL, "https://hachisky.example.test");
});

test("loadAuthEnv rejects production with an http base URL", () => {
  assert.throws(
    () =>
      loadAuthEnv({
        ...VALID_AUTH,
        APP_ENV: "production",
        BETTER_AUTH_URL: "http://hachisky.example.test",
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("BETTER_AUTH_URL"),
  );
});

test("loadAuthEnv normalizes the base URL to its origin", () => {
  const env = loadAuthEnv({
    ...VALID_AUTH,
    BETTER_AUTH_URL: "http://localhost:3100/",
  });
  assert.equal(env.BETTER_AUTH_URL, "http://localhost:3100");
});

test("loadAuthEnv rejects a base URL with a path, credentials or non-http scheme", () => {
  for (const url of [
    "http://localhost:3100/app",
    "http://user:pw@localhost:3100",
    "ftp://localhost:3100",
    "localhost:3100",
    "not a url",
  ]) {
    assert.throws(
      () => loadAuthEnv({ ...VALID_AUTH, BETTER_AUTH_URL: url }),
      (error: unknown) =>
        error instanceof Error && error.message.includes("BETTER_AUTH_URL"),
      url,
    );
  }
});

test("loadAuthEnv rejects a missing or short secret without leaking it", () => {
  const { BETTER_AUTH_SECRET: _omit, ...missing } = VALID_AUTH;
  assert.throws(
    () => loadAuthEnv(missing),
    (error: unknown) =>
      error instanceof Error && error.message.includes("BETTER_AUTH_SECRET"),
  );
  const short = "short-secret-do-not-leak";
  assert.throws(
    () => loadAuthEnv({ ...VALID_AUTH, BETTER_AUTH_SECRET: short }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("BETTER_AUTH_SECRET") &&
      !error.message.includes(short),
  );
});
