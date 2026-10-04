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

test("init-admin is a one-shot step after migrate with a private secrets bind mount", () => {
  const init = serviceBlock("init-admin");
  assert.doesNotMatch(init, /profiles:/, "runs on every `up`, not a profile");
  assert.match(init, /image: hachisky-web:local/);
  assert.match(
    init,
    /(command|entrypoint): \["node", "src\/auth\/default-admin-cli\.ts"\]/,
  );
  assert.match(init, /restart: "no"/);
  assert.match(init, /migrate:\n\s+condition: service_completed_successfully/);
  assert.match(init, /- \.\/secrets:\/run\/hachisky-secrets:Z/);
  assert.match(init, /HACHISKY_SECRETS_DIR: \/run\/hachisky-secrets/);
  assert.match(init, /BETTER_AUTH_SECRET: \$\{BETTER_AUTH_SECRET:-\}/);
});

test("init-admin never receives a password through env or command", () => {
  const init = serviceBlock("init-admin");
  for (const line of init.split("\n")) {
    // Comments are not configuration; the database password is not the
    // admin password.
    if (/^\s*#/.test(line) || /PGPASSWORD|BETTER_AUTH_SECRET/.test(line)) {
      continue;
    }
    assert.doesNotMatch(line, /password/i, `unexpected: ${line.trim()}`);
  }
  assert.doesNotMatch(init, /stdin_open/);
});

test("web starts only after init-admin completed successfully", () => {
  const web = serviceBlock("web");
  assert.match(
    web,
    /init-admin:\n\s+condition: service_completed_successfully/,
  );
  // The manual stdin bootstrap stays available under the ops profile.
  assert.match(serviceBlock("bootstrap-admin"), /profiles: \["ops"\]/);
});

test("the secrets directory is never committed nor sent to the image", () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")
      .split("\n")
      .map((line) => line.trim());
  assert.ok(read(".gitignore").includes("secrets/"));
  assert.ok(read(".dockerignore").includes("secrets"));
});
