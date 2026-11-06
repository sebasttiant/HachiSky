import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const expectedNodeVersion = "26.13.0";
const expectedPnpmVersion = "12.18.0";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  engines?: { node?: string };
  packageManager?: string;
};
const dockerfile = readFileSync(
  new URL("../../Dockerfile", import.meta.url),
  "utf8",
);

test("Node and pnpm stay aligned across package and Docker contracts", () => {
  assert.equal(packageJson.engines?.node, expectedNodeVersion);
  assert.equal(packageJson.packageManager, `pnpm@${expectedPnpmVersion}`);
  assert.match(
    dockerfile,
    new RegExp(
      `^FROM node:${expectedNodeVersion}-trixie-slim@sha256:[a-f0-9]{64} AS base$`,
      "m",
    ),
  );
  assert.match(
    dockerfile,
    new RegExp(`npm install --global pnpm@${expectedPnpmVersion}`),
  );
  assert.doesNotMatch(dockerfile, /^RUN .*\bcorepack\b/im);
});
