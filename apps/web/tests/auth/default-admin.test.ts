import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type BootstrapHooks,
  createBootstrapDeps,
  runBootstrap,
} from "../../src/auth/bootstrap-admin.ts";
import {
  DEFAULT_ADMIN,
  ensureDefaultAdmin,
  generateInitialPassword,
  PASSWORD_FILE,
} from "../../src/auth/default-admin.ts";
import { closeDb, getDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { loadAuthEnv } from "../../src/shared/config/env.ts";

const AUTH_ENV = {
  APP_ENV: "test",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef-0123456789",
};
const CLI = fileURLToPath(
  new URL("../../src/auth/default-admin-cli.ts", import.meta.url),
);

let base: string;
const bases: string[] = [];
let secretsDir: string;

function deps(hooks?: BootstrapHooks) {
  return createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV), hooks });
}

function ensure(hooks?: BootstrapHooks) {
  return ensureDefaultAdmin(deps(hooks), { secretsDir });
}

function finalFile() {
  return path.join(secretsDir, PASSWORD_FILE);
}

function mode(file: string) {
  return statSync(file).mode & 0o777;
}

async function clean() {
  await getPool().query(
    'truncate table admin_bootstrap, user_security, session, account, verification, "user" cascade',
  );
}

async function state() {
  const db = getDb();
  const users = await db.select().from(schema.user);
  const accounts = await db.select().from(schema.account);
  const records = await db.select().from(schema.adminBootstrap);
  const security = await db.select().from(schema.userSecurity);
  return { users, accounts, records, security };
}

async function signIn(password: string) {
  const d = deps();
  try {
    return await d.auth.api.signInEmail({
      body: { email: DEFAULT_ADMIN.email, password },
    });
  } finally {
    await d.client.end().catch(() => undefined);
  }
}

function runCli(env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [CLI], {
        env: { ...process.env, ...AUTH_ENV, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await clean();
  base = mkdtempSync(path.join(tmpdir(), "default-admin-"));
  bases.push(base);
  secretsDir = path.join(base, "secrets");
});

after(async () => {
  await clean();
  await closeDb();
});

describe("generated password", () => {
  it("is long, unambiguous and different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const password = generateInitialPassword();
      assert.ok(password.length >= 24, `too short: ${password.length}`);
      assert.match(password, /^[A-HJ-NP-Za-km-z2-9]+$/);
      seen.add(password);
    }
    assert.equal(seen.size, 50);
  });
});

describe("fresh database", () => {
  it("creates exactly one admin, writes the password file 0600 in a 0700 dir, and forces a change", async () => {
    const result = await ensure();
    assert.equal(result.outcome, "created");
    assert.equal(result.exitCode, 0);

    const { users, accounts, records, security } = await state();
    assert.equal(users.length, 1);
    const [admin] = users;
    assert.ok(admin);
    assert.equal(admin.email, DEFAULT_ADMIN.email);
    assert.equal(admin.email, "admin@ilasesorias.com");
    assert.equal(admin.role, "admin");
    assert.equal(admin.name, "Administrador");
    assert.equal(admin.jobTitle, "Administrador");
    assert.equal(accounts.length, 1);
    assert.equal(records[0]?.adminUserId, admin.id);
    assert.equal(security.length, 1);
    assert.equal(security[0]?.userId, admin.id);
    assert.equal(security[0]?.mustChangePassword, true);

    assert.equal(mode(secretsDir), 0o700);
    assert.equal(mode(finalFile()), 0o600);
    assert.deepEqual(readdirSync(secretsDir), [PASSWORD_FILE], "no tmp left");
    const password = readFileSync(finalFile(), "utf8").trim();
    assert.ok(password.length >= 24);
    assert.notEqual(accounts[0]?.password, password, "stored as a hash");

    const signedIn = await signIn(password);
    assert.ok(signedIn.token);
  });

  it("the CLI prints one line without the password and exits 0", async () => {
    const result = await runCli({ HACHISKY_SECRETS_DIR: secretsDir });
    assert.equal(result.code, 0, result.stderr);
    const password = readFileSync(finalFile(), "utf8").trim();
    for (const stream of [result.stdout, result.stderr]) {
      assert.ok(!stream.includes(password), "password must never be printed");
    }
    assert.equal(
      result.stdout,
      "default-admin: created; password in secrets/initial-admin-password\n",
    );
  });
});

describe("idempotency", () => {
  it("a second run is a no-op: file untouched and the password still works", async () => {
    assert.equal((await ensure()).outcome, "created");
    const file = finalFile();
    const content = readFileSync(file);
    const hash = createHash("sha256").update(content).digest("hex");
    const mtime = statSync(file).mtimeMs;
    const before = await state();

    const second = await ensure();
    assert.equal(second.outcome, "already_initialized");
    assert.equal(second.exitCode, 0);

    assert.equal(
      createHash("sha256").update(readFileSync(file)).digest("hex"),
      hash,
    );
    assert.equal(statSync(file).mtimeMs, mtime);
    assert.deepEqual(readdirSync(secretsDir), [PASSWORD_FILE]);
    assert.deepEqual(await state(), before);
    assert.ok((await signIn(content.toString("utf8").trim())).token);

    const cli = await runCli({ HACHISKY_SECRETS_DIR: secretsDir });
    assert.equal(cli.code, 0, cli.stderr);
    assert.equal(cli.stdout, "default-admin: already initialized\n");
  });

  it("an installation bootstrapped through the stdin path is left alone and no file is written", async () => {
    const manual = await runBootstrap(
      {
        email: "owner@example.test",
        name: "Owner",
        jobTitle: "Owner",
        password: "manual-bootstrap-password-42",
      },
      deps(),
    );
    assert.equal(manual.exitCode, 0);
    const before = await state();

    const result = await ensure();
    assert.equal(result.outcome, "already_initialized");
    assert.equal(result.exitCode, 0);
    assert.equal(existsSync(secretsDir), false, "secrets dir not created");
    assert.deepEqual(await state(), before);
  });

  it("an admin without a bootstrap record also counts as initialized", async () => {
    const d = deps();
    await d.auth.api.createUser({
      body: {
        email: "outside@example.test",
        password: "outside-admin-password-42",
        name: "Outside",
        role: "admin",
      },
    });
    const before = await state();
    const result = await ensure();
    assert.equal(result.outcome, "already_initialized");
    assert.equal(existsSync(secretsDir), false);
    assert.deepEqual(await state(), before);
  });
});

describe("refusals and failures", () => {
  it("refuses to overwrite an existing password file on an uninitialized database", async () => {
    mkdirSync(secretsDir, { mode: 0o700 });
    writeFileSync(finalFile(), "previous-password\n", { mode: 0o600 });

    const result = await ensure();
    assert.equal(result.outcome, "password_file_exists");
    assert.notEqual(result.exitCode, 0);
    assert.equal(readFileSync(finalFile(), "utf8"), "previous-password\n");
    assert.deepEqual(readdirSync(secretsDir), [PASSWORD_FILE]);
    const { users, records } = await state();
    assert.equal(users.length, 0);
    assert.equal(records.length, 0);

    const cli = await runCli({ HACHISKY_SECRETS_DIR: secretsDir });
    assert.equal(cli.code, result.exitCode);
    assert.match(cli.stdout, /^default-admin: password_file_exists/);
  });

  it("a staff user holding the email: refused, temporary file removed, no final file", async () => {
    const d = deps();
    await d.auth.api.createUser({
      body: {
        email: DEFAULT_ADMIN.email,
        password: "staff-password-1234",
        name: "Staff",
      },
    });
    const before = await state();
    const result = await ensure();
    assert.equal(result.exitCode, 4);
    assert.equal(
      result.outcome === "inconsistent" && result.reason,
      "email_exists",
    );
    assert.deepEqual(readdirSync(secretsDir), []);
    assert.deepEqual(await state(), before);
  });

  it("a failure after the admin was created keeps the temporary file and writes no final file", async () => {
    const result = await ensure({
      beforeRecord: async () => {
        throw new Error("injected interruption before the record");
      },
    });
    assert.equal(result.exitCode, 4);
    const files = readdirSync(secretsDir);
    assert.equal(files.length, 1);
    assert.ok(files[0]?.endsWith(".tmp"), files[0]);
    assert.equal(existsSync(finalFile()), false);
    const kept = path.join(secretsDir, files[0] ?? "");
    assert.equal(mode(kept), 0o600);
    // The temporary file still opens the partially bootstrapped account.
    assert.ok((await signIn(readFileSync(kept, "utf8").trim())).token);

    // Nothing is deleted or repaired; the next run sees an admin and stops.
    const next = await ensure();
    assert.equal(next.outcome, "already_initialized");
    assert.deepEqual(readdirSync(secretsDir), files);
  });
});

process.on("exit", () => {
  for (const dir of bases) rmSync(dir, { recursive: true, force: true });
});
