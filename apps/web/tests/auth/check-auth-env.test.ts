import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(
  new URL("../../src/auth/check-auth-env-cli.ts", import.meta.url),
);
const VALID_SECRET = "preflight-secret-0123456789abcdef-012345";

function run(env: Record<string, string>) {
  const result = spawnSync(process.execPath, [CLI], {
    // Same NODE_ENV as the `web` container.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", ...env },
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("auth environment preflight", () => {
  it("exits 0 when the auth environment is valid", () => {
    const { status } = run({
      APP_ENV: "development",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: VALID_SECRET,
    });
    assert.equal(status, 0);
  });

  it("exits 1 naming the missing secret", () => {
    const { status, output } = run({
      APP_ENV: "development",
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      BETTER_AUTH_SECRET: "",
    });
    assert.equal(status, 1);
    assert.match(output, /BETTER_AUTH_SECRET/);
    assert.match(output, /README/);
  });

  it("never echoes the rejected values", () => {
    const shortSecret = "short-secret-value-xyz";
    const badUrl = "http://127.0.0.1:3100/some-path-value";
    const { status, output } = run({
      APP_ENV: "development",
      BETTER_AUTH_URL: badUrl,
      BETTER_AUTH_SECRET: shortSecret,
    });
    assert.equal(status, 1);
    assert.doesNotMatch(output, /short-secret-value-xyz/);
    assert.doesNotMatch(output, /some-path-value/);
    assert.match(output, /BETTER_AUTH_URL/);
    assert.match(output, /BETTER_AUTH_SECRET/);
  });
});
