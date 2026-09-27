import assert from "node:assert/strict";
import { test } from "node:test";
import { describeMigrationError } from "./migrate.ts";

test("describeMigrationError extracts the SQLSTATE code from the error itself", () => {
  const error = Object.assign(
    new Error(
      'Failed query: select * from secret_table params: ["password=hunter2-fake"]',
    ),
    { code: "28P01" },
  );

  assert.equal(describeMigrationError(error), "Migration failed (code=28P01)");
});

test("describeMigrationError never leaks the wrapped query, params, or message", () => {
  const error = Object.assign(
    new Error(
      'Failed query: select * from users params: ["password=hunter2-fake"]',
    ),
    { code: "28P01" },
  );

  const described = describeMigrationError(error);

  assert.ok(!described.includes("hunter2-fake"));
  assert.ok(!described.includes("Failed query"));
  assert.ok(!described.includes("params"));
});

test("describeMigrationError falls back to the cause's code when the error has none", () => {
  const error = new Error("Failed query: select 1", {
    cause: Object.assign(new Error("x"), { code: "42P01" }),
  });

  assert.equal(describeMigrationError(error), "Migration failed (code=42P01)");
});

test("describeMigrationError returns unknown when no code is present anywhere", () => {
  const error = new Error("boom");

  assert.equal(
    describeMigrationError(error),
    "Migration failed (code=unknown)",
  );
});

test("describeMigrationError returns unknown for non-Error values", () => {
  assert.equal(
    describeMigrationError("boom"),
    "Migration failed (code=unknown)",
  );
  assert.equal(
    describeMigrationError(undefined),
    "Migration failed (code=unknown)",
  );
  assert.equal(
    describeMigrationError({ code: "DROP TABLE" }),
    "Migration failed (code=unknown)",
  );
});
