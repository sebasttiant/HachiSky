import type { Pool } from "pg";

export interface TestTargetIdentity {
  database: string;
  user: string;
  cluster: string;
  host: string;
}

// The exact destination this test suite is allowed to touch. A suffix match
// (e.g. any database ending in "_test") is NOT enough: we compare every
// field against this exact expected identity so a misconfigured PGHOST can
// never point the test run at a real database.
export const EXPECTED_TEST_TARGET: TestTargetIdentity = {
  database: "hachisky_test",
  user: "hachisky_test",
  cluster: "hachisky-test",
  host: "db-test",
};

export function checkTestTarget(
  identity: TestTargetIdentity,
  expected: TestTargetIdentity = EXPECTED_TEST_TARGET,
): string[] {
  const mismatches: string[] = [];
  if (identity.database !== expected.database) {
    mismatches.push(
      `database: expected "${expected.database}", got "${identity.database}"`,
    );
  }
  if (identity.user !== expected.user) {
    mismatches.push(
      `user: expected "${expected.user}", got "${identity.user}"`,
    );
  }
  if (identity.cluster !== expected.cluster) {
    mismatches.push(
      `cluster: expected "${expected.cluster}", got "${identity.cluster}"`,
    );
  }
  if (identity.host !== expected.host) {
    mismatches.push(
      `host: expected "${expected.host}", got "${identity.host}"`,
    );
  }
  return mismatches;
}

interface TestTargetRow {
  database: string;
  user: string;
  cluster: string;
}

// Must be called, and must throw on any mismatch, before any test touches
// data. This is the last line of defense against a test suite accidentally
// running destructive queries against a non-disposable database.
export async function assertTestDatabase(pool: Pool): Promise<void> {
  if (process.env.APP_ENV !== "test") {
    throw new Error('assertTestDatabase refused: APP_ENV must be "test"');
  }

  const result = await pool.query<TestTargetRow>(
    `select current_database() as database, current_user as "user", current_setting('cluster_name') as cluster`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "assertTestDatabase refused: identity query returned no rows",
    );
  }

  const identity: TestTargetIdentity = {
    database: row.database,
    user: row.user,
    cluster: row.cluster,
    host: process.env.PGHOST ?? "",
  };

  const mismatches = checkTestTarget(identity);
  if (mismatches.length > 0) {
    throw new Error(
      `Refusing to run tests against unexpected database target: ${mismatches.join("; ")}`,
    );
  }
}
