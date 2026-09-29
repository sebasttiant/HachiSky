import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const compose = readFileSync(
  new URL("../../compose.yaml", import.meta.url),
  "utf8",
);

test("every pg_isready healthcheck probes TCP on 127.0.0.1", () => {
  const probes = compose.split("\n").filter((l) => l.includes("pg_isready"));
  assert.ok(probes.length >= 2, "expected db and db-test healthchecks");
  for (const probe of probes) {
    assert.match(
      probe,
      /pg_isready -h 127\.0\.0\.1 /,
      `healthcheck must use TCP, not the Unix socket: ${probe.trim()}`,
    );
  }
});
