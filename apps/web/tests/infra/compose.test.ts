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

// Text of one top-level service block (compose.yaml uses 2-space indents).
function serviceBlock(name: string): string {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `service ${name} not found`);
  const end = lines.findIndex(
    (line, index) => index > start && /^ {2}[a-z][a-z-]*:\s*$/.test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

test("web receives the browser origin and the auth secret without breaking other profiles", () => {
  const web = serviceBlock("web");
  assert.match(
    web,
    /BETTER_AUTH_URL: http:\/\/127\.0\.0\.1:\$\{HACHISKY_WEB_PORT:-3100\}/,
  );
  // `:-`, never `:?`: compose interpolates every service, so a required
  // variable would break `--profile test` and `up db` without a secret.
  assert.match(web, /BETTER_AUTH_SECRET: \$\{BETTER_AUTH_SECRET:-\}/);
  assert.doesNotMatch(compose, /BETTER_AUTH_SECRET:\?/);
});

test("web validates the auth environment before starting the server", () => {
  const web = serviceBlock("web");
  assert.match(
    web,
    /command: \["sh", "-c", "node src\/auth\/check-auth-env-cli\.ts && exec pnpm start"\]/,
  );
});
