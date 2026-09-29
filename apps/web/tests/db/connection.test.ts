import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDb, getPool } from "../../src/db/client.ts";
import {
  assertTestDatabase,
  checkTestTarget,
  EXPECTED_TEST_TARGET,
} from "../../src/db/test-guard.ts";

test("checkTestTarget accepts an exact match", () => {
  const mismatches = checkTestTarget({ ...EXPECTED_TEST_TARGET });
  assert.deepEqual(mismatches, []);
});

test("checkTestTarget rejects a mismatching database", () => {
  const mismatches = checkTestTarget({
    ...EXPECTED_TEST_TARGET,
    database: "hachisky",
  });
  assert.ok(mismatches.some((m) => m.includes("database")));
});

test("checkTestTarget rejects a mismatching user", () => {
  const mismatches = checkTestTarget({
    ...EXPECTED_TEST_TARGET,
    user: "hachisky",
  });
  assert.ok(mismatches.some((m) => m.includes("user")));
});

test("checkTestTarget rejects a mismatching cluster", () => {
  const mismatches = checkTestTarget({
    ...EXPECTED_TEST_TARGET,
    cluster: "hachisky",
  });
  assert.ok(mismatches.some((m) => m.includes("cluster")));
});

test("checkTestTarget rejects a mismatching host", () => {
  const mismatches = checkTestTarget({ ...EXPECTED_TEST_TARGET, host: "db" });
  assert.ok(mismatches.some((m) => m.includes("host")));
});

test("assertTestDatabase passes against the real disposable test database", async () => {
  await assert.doesNotReject(() => assertTestDatabase(getPool()));
});

test.after(async () => {
  await closeDb();
});
