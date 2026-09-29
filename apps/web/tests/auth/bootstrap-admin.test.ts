import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  BOOTSTRAP_LOCK_KEY,
  type BootstrapHooks,
  type BootstrapInput,
  createBootstrapDeps,
  EXIT_USAGE,
  runBootstrap,
} from "../../src/auth/bootstrap-admin.ts";
import { closeDb, getDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { loadAuthEnv } from "../../src/shared/config/env.ts";

const PASSWORD = "bootstrap-test-password-42";
const AUTH_ENV = {
  APP_ENV: "test",
  BETTER_AUTH_URL: "http://localhost:3100",
  BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef-0123456789",
};
const CLI = fileURLToPath(
  new URL("../../src/auth/bootstrap-admin-cli.ts", import.meta.url),
);

function input(n = 1): BootstrapInput {
  return {
    email: `owner${n}@example.test`,
    name: "Ana Maria Perez Gomez",
    jobTitle: "Agency owner",
    password: PASSWORD,
  };
}

function runInProcess(bootstrapInput: BootstrapInput, hooks?: BootstrapHooks) {
  return runBootstrap(
    bootstrapInput,
    createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV), hooks }),
  );
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  stdin: string | null,
  env: Record<string, string | undefined> = {},
  entry: string = CLI,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { ...process.env, ...AUTH_ENV, ...env },
      stdio: ["pipe", "pipe", "pipe"],
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
    if (stdin !== null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

function cliArgs(n = 1): string[] {
  const value = input(n);
  return [
    "--email",
    value.email,
    "--name",
    value.name,
    "--job-title",
    value.jobTitle,
  ];
}

async function clean() {
  await getPool().query(
    'truncate table admin_bootstrap, session, account, verification, "user" cascade',
  );
}

async function state() {
  const db = getDb();
  const users = await db.select().from(schema.user);
  const accounts = await db.select().from(schema.account);
  const records = await db.select().from(schema.adminBootstrap);
  return { users, accounts, records };
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
  await clean();
});

after(async () => {
  await clean();
  await closeDb();
});

describe("happy path", () => {
  it("creates the admin, the credential account and the record; exit 0; no secret in output", async () => {
    await clean();
    const result = await runCli(cliArgs(), `${PASSWORD}\n`);
    assert.equal(result.code, 0, result.stderr);
    for (const stream of [result.stdout, result.stderr]) {
      assert.ok(!stream.includes(PASSWORD), "password must never be printed");
    }
    const { users, accounts, records } = await state();
    assert.equal(users.length, 1);
    const admin = users[0];
    assert.ok(admin);
    assert.equal(admin.role, "admin");
    assert.equal(admin.jobTitle, "Agency owner");
    assert.equal(admin.name, "Ana Maria Perez Gomez");
    assert.equal(admin.email, "owner1@example.test");
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]?.providerId, "credential");
    assert.equal(accounts[0]?.userId, admin.id);
    assert.notEqual(accounts[0]?.password, PASSWORD, "stored as a hash");
    assert.equal(records.length, 1);
    assert.equal(records[0]?.adminUserId, admin.id);
  });

  it("strips exactly one trailing newline from the password", async () => {
    await clean();
    const result = await runCli(cliArgs(), `${PASSWORD}\r\n`);
    assert.equal(result.code, 0, result.stderr);
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    const signedIn = await deps.auth.api.signInEmail({
      body: { email: "owner1@example.test", password: PASSWORD },
    });
    assert.ok(signedIn.token);
    await deps.client.end().catch(() => {});
  });
});

describe("usage errors (exit 1)", () => {
  it("rejects a missing argument", async () => {
    const result = await runCli(["--email", "a@example.test"], PASSWORD);
    assert.equal(result.code, 1);
    assert.ok(!result.stderr.includes(PASSWORD));
  });

  it("rejects a password passed as an argument", async () => {
    const result = await runCli(
      [...cliArgs(), "--password", PASSWORD],
      PASSWORD,
    );
    assert.equal(result.code, 1);
    assert.ok(!result.stdout.includes(PASSWORD));
    assert.ok(!result.stderr.includes(PASSWORD));
  });

  it("ignores a password in the environment and requires stdin", async () => {
    await clean();
    const result = await runCli(cliArgs(), "", {
      BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
      PASSWORD,
    });
    assert.equal(result.code, 1);
    assert.equal((await state()).users.length, 0);
  });

  it("rejects an invalid email and a too-short password", async () => {
    assert.equal(
      (await runCli(["--email", "nope", ...cliArgs().slice(2)], PASSWORD)).code,
      1,
    );
    assert.equal((await runCli(cliArgs(), "short")).code, 1);
  });

  it("exits 1 on invalid auth configuration", async () => {
    const result = await runCli(cliArgs(), PASSWORD, {
      BETTER_AUTH_SECRET: "too-short",
    });
    assert.equal(result.code, 1);
    assert.ok(!result.stderr.includes("too-short"));
  });
});

describe("existing record (exit 2)", () => {
  it("refuses a second run and changes nothing", async () => {
    await clean();
    assert.equal((await runCli(cliArgs(1), PASSWORD)).code, 0);
    const before = await state();
    const second = await runCli(cliArgs(2), PASSWORD);
    assert.equal(second.code, 2, second.stderr);
    assert.deepEqual(await state(), before);
  });

  it("still refuses with 2 when the bootstrapped admin is banned", async () => {
    await getPool().query('update "user" set banned = true');
    const before = await state();
    const again = await runCli(cliArgs(3), PASSWORD);
    assert.equal(again.code, 2, again.stderr);
    assert.deepEqual(await state(), before);
  });
});

describe("inconsistent state (exit 4)", () => {
  it("refuses an admin that exists without a record and adopts nothing", async () => {
    await clean();
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    await deps.auth.api.createUser({
      body: {
        email: "outside@example.test",
        password: PASSWORD,
        name: "Created Outside",
        role: "admin",
      },
    });
    await deps.client.end().catch(() => {});
    const before = await state();
    const result = await runCli(cliArgs(), PASSWORD);
    assert.equal(result.code, 4, result.stderr);
    assert.deepEqual(await state(), before);
    assert.equal(before.records.length, 0);
  });

  it("refuses when a staff user already holds the target email", async () => {
    await clean();
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    await deps.auth.api.createUser({
      body: {
        email: "owner1@example.test",
        password: PASSWORD,
        name: "Existing Staff",
      },
    });
    await deps.client.end().catch(() => {});
    const before = await state();
    const result = await runCli(cliArgs(1), PASSWORD);
    assert.equal(result.code, 4, result.stderr);
    assert.deepEqual(await state(), before);
  });
});

describe("concurrency", () => {
  it("10 real processes on a clean database: exactly one 0 and nine 2", async () => {
    await clean();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => runCli(cliArgs(i + 1), PASSWORD)),
    );
    const codes = results.map((r) => r.code).sort();
    assert.deepEqual(
      codes,
      [0, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      results.map((r) => r.stderr).join("|"),
    );
    const { users, accounts, records } = await state();
    assert.equal(users.filter((u) => u.role === "admin").length, 1);
    assert.equal(users.length, 1);
    assert.equal(accounts.length, 1);
    assert.equal(records.length, 1);
  });
});

describe("faults: what persists", () => {
  it("A: user created but credential account fails -> exit 4; partial user persists, no record; next run refuses", async () => {
    await clean();
    const pool = getPool();
    await pool.query(
      `create or replace function fail_account_insert() returns trigger language plpgsql as $$ begin raise exception 'injected account failure'; end $$`,
    );
    await pool.query(
      "create trigger fail_account_insert before insert on account for each row execute function fail_account_insert()",
    );
    let first: CliResult;
    try {
      first = await runCli(cliArgs(), PASSWORD);
    } finally {
      await pool.query("drop trigger if exists fail_account_insert on account");
      await pool.query("drop function if exists fail_account_insert()");
    }
    assert.equal(first.code, 4, first.stderr);
    for (const stream of [first.stdout, first.stderr]) {
      assert.ok(!stream.includes(PASSWORD));
      assert.ok(!stream.includes("params"), "no SQL parameters in output");
    }
    const persisted = await state();
    assert.equal(persisted.users.length, 1);
    assert.equal(persisted.users[0]?.role, "admin");
    assert.equal(persisted.accounts.length, 0, "no credential account");
    assert.equal(persisted.records.length, 0, "no bootstrap record");

    const second = await runCli(cliArgs(), PASSWORD);
    assert.equal(second.code, 4, second.stderr);
    assert.deepEqual(await state(), persisted, "nothing deleted or repaired");
  });

  it("B: interruption after complete creation, before the record -> exit 4; complete admin persists; next run refuses", async () => {
    await clean();
    const result = await runInProcess(input(), {
      beforeRecord: async () => {
        throw new Error("injected interruption before the record");
      },
    });
    assert.equal(result.exitCode, 4);
    assert.equal(
      result.exitCode === 4 && result.reason,
      "interrupted",
      "an unexpected failure after the first write is reported as interrupted",
    );
    const persisted = await state();
    assert.equal(persisted.users.length, 1);
    assert.equal(persisted.users[0]?.role, "admin");
    assert.equal(persisted.accounts.length, 1);
    assert.equal(persisted.accounts[0]?.providerId, "credential");
    assert.equal(persisted.records.length, 0);

    const next = await runCli(cliArgs(), PASSWORD);
    assert.equal(next.code, 4, next.stderr);
    assert.deepEqual(await state(), persisted);
  });

  it("C: lock connection terminated before the record -> exit 4; no record persisted", async () => {
    await clean();
    const result = await runInProcess(input(), {
      beforeRecord: async ({ lockPid }) => {
        await getPool().query("select pg_terminate_backend($1, 5000)", [
          lockPid,
        ]);
      },
    });
    assert.equal(result.exitCode, 4);
    assert.ok(
      result.reason === "lock_lost" || result.reason === "record_failed",
      `unexpected reason ${result.reason}`,
    );
    const persisted = await state();
    assert.equal(persisted.records.length, 0);
    assert.equal(persisted.users.length, 1, "the complete admin persists");
    assert.equal(persisted.accounts.length, 1);
  });

  it("C2: exclusion is NOT guaranteed after the lock is lost; a concurrent run can create a second admin, which is detected as exit 4", async () => {
    await clean();
    let secondResult: Awaited<ReturnType<typeof runInProcess>> | undefined;
    const first = await runInProcess(input(1), {
      beforeCreateUser: async ({ lockPid }) => {
        // Lock lost right after the first run checked it and before it
        // creates anything: the next run can take the lock and finish.
        await getPool().query("select pg_terminate_backend($1, 5000)", [
          lockPid,
        ]);
        secondResult = await runInProcess(input(2));
      },
    });
    assert.equal(secondResult?.exitCode, 0, "second run took the freed lock");
    assert.equal(
      first.exitCode,
      4,
      "first run detects two admins or lock loss",
    );
    const persisted = await state();
    assert.equal(
      persisted.users.filter((u) => u.role === "admin").length,
      2,
      "two administrators exist: exclusion was lost",
    );
    assert.equal(persisted.records.length, 1);
    const [record] = persisted.records;
    const recorded = persisted.users.find((u) => u.id === record?.adminUserId);
    assert.equal(recorded?.email, "owner2@example.test");
  });
});

describe("entry point never exits 0 without running main", () => {
  // Missing arguments make a working entry report a usage error (exit 1). A
  // skipped main() would exit 0 silently.
  async function expectReachesMain(entry: string) {
    const result = await runCli([], PASSWORD, {}, entry);
    assert.equal(
      result.code,
      1,
      `stdout=${result.stdout} stderr=${result.stderr}`,
    );
    assert.match(result.stdout, /usage_error/);
  }

  it("reaches main() from a path containing spaces", async () => {
    const base = mkdtempSync(path.join(tmpdir(), "bootstrap cli "));
    try {
      const app = path.join(base, "app copy");
      mkdirSync(app);
      cpSync(
        fileURLToPath(new URL("../../src", import.meta.url)),
        path.join(app, "src"),
        {
          recursive: true,
        },
      );
      symlinkSync(
        fileURLToPath(new URL("../../node_modules", import.meta.url)),
        path.join(app, "node_modules"),
      );
      await expectReachesMain(
        path.join(app, "src", "auth", "bootstrap-admin-cli.ts"),
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("reaches main() through a symlink to the entry file", async () => {
    const base = mkdtempSync(path.join(tmpdir(), "bootstrap-cli-link-"));
    try {
      const link = path.join(base, "cli.ts");
      symlinkSync(CLI, link);
      await expectReachesMain(link);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("reaches main() from a symlink whose path also contains spaces", async () => {
    const base = mkdtempSync(path.join(tmpdir(), "bootstrap cli "));
    try {
      mkdirSync(path.join(base, "nested dir"));
      const link = path.join(base, "nested dir", "cli link.ts");
      symlinkSync(CLI, link);
      await expectReachesMain(link);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("entry file structure", () => {
  const source = readFileSync(CLI, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("contains no main-module check that could skip main()", () => {
    for (const forbidden of [
      /import\.meta\.url/,
      /import\.meta\.filename/,
      /import\.meta\.main/,
      /process\.argv\s*\[\s*1\s*\]/,
      /require\.main/,
      /fileURLToPath/,
      /pathToFileURL/,
      /isMainModule/,
    ]) {
      assert.doesNotMatch(source, forbidden);
    }
  });

  it("sets a non-zero exit code at top level, right before an unconditional await main()", () => {
    assert.notEqual(EXIT_USAGE, 0);
    // Anchored at column 0: statements inside main() or inside an `if` are
    // indented, so they cannot satisfy this.
    assert.match(
      source,
      /^process\.exitCode = EXIT_USAGE;\s*\nawait main\(\);/m,
    );
  });
});

// The documented recovery statement lives in one file that the README
// references; the tests execute that exact text.
const RECORD_SQL = readFileSync(
  new URL("../../scripts/record-bootstrap-admin.sql", import.meta.url),
  "utf8",
);

interface RecordSqlOutcome {
  ok: boolean;
  message: string;
}

// A negative outcome only counts when the script's own guard refused. Any
// other error (syntax, missing column, connection) must fail the test.
function assertGuardFailed(outcome: RecordSqlOutcome, label: string) {
  assert.equal(outcome.ok, false, label);
  assert.match(outcome.message, /guard failed/, `${label}: ${outcome.message}`);
}

async function runRecordSql(adminId: string): Promise<RecordSqlOutcome> {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  await client.connect();
  try {
    // psql substitutes :'admin_id'; here the same token is replaced textually.
    await client.query(
      RECORD_SQL.replaceAll(
        ":'admin_id'",
        `'${adminId.replaceAll("'", "''")}'`,
      ),
    );
    return { ok: true, message: "" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return { ok: false, message: (error as Error).message };
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe("documented recovery SQL (record-bootstrap-admin.sql)", () => {
  it("takes the same advisory lock key as the CLI, as an exact statement", () => {
    const executable = RECORD_SQL.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const lock = new RegExp(
      `^\\s*SELECT\\s+pg_advisory_xact_lock\\(\\s*${BOOTSTRAP_LOCK_KEY}\\s*\\)\\s*;`,
      "im",
    );
    assert.match(executable, lock);
  });

  it("records a complete single admin (fault B state) and the next CLI run exits 2", async () => {
    await clean();
    const interrupted = await runInProcess(input(), {
      beforeRecord: async () => {
        throw new Error("injected interruption before the record");
      },
    });
    assert.equal(interrupted.exitCode, 4);
    const [admin] = (await state()).users;
    assert.ok(admin);
    const outcome = await runRecordSql(admin.id);
    assert.equal(outcome.ok, true);
    const { records } = await state();
    assert.equal(records.length, 1);
    assert.equal(records[0]?.adminUserId, admin.id);
    assert.equal((await runCli(cliArgs(), PASSWORD)).code, 2);
  });

  it("inserts nothing when two admins exist", async () => {
    await clean();
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    for (const n of [1, 2]) {
      await deps.auth.api.createUser({
        body: {
          email: `admin${n}@example.test`,
          password: PASSWORD,
          name: `Admin ${n}`,
          role: "admin",
        },
      });
    }
    await deps.client.end().catch(() => {});
    const [first] = (await state()).users;
    assert.ok(first);
    assertGuardFailed(await runRecordSql(first.id), "two admins");
    assert.equal((await state()).records.length, 0);
  });

  it("inserts nothing when the admin has no credential account, or the id is not an admin", async () => {
    await clean();
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    await deps.auth.api.createUser({
      body: {
        email: "nocred@example.test",
        name: "No Credential",
        role: "admin",
      },
    });
    const { user: staff } = await deps.auth.api.createUser({
      body: {
        email: "staff@example.test",
        password: PASSWORD,
        name: "Staff",
      },
    });
    await deps.client.end().catch(() => {});
    const [admin] = (await state()).users.filter((u) => u.role === "admin");
    assert.ok(admin);
    assertGuardFailed(await runRecordSql(admin.id), "no credential");
    assertGuardFailed(await runRecordSql(staff.id), "not an admin");
    assert.equal((await state()).records.length, 0);
  });

  it("inserts nothing when the sole admin is banned", async () => {
    await clean();
    const deps = createBootstrapDeps({ authEnv: loadAuthEnv(AUTH_ENV) });
    await deps.auth.api.createUser({
      body: {
        email: "banned@example.test",
        password: PASSWORD,
        name: "Banned Admin",
        role: "admin",
      },
    });
    await deps.client.end().catch(() => {});
    await getPool().query('update "user" set banned = true');
    const [admin] = (await state()).users;
    assert.ok(admin);
    assertGuardFailed(await runRecordSql(admin.id), "banned admin");
    assert.equal((await state()).records.length, 0);
  });

  it("succeeds once and fails when run a second time", async () => {
    await clean();
    const interrupted = await runInProcess(input(), {
      beforeRecord: async () => {
        throw new Error("injected interruption before the record");
      },
    });
    assert.equal(interrupted.exitCode, 4);
    const [admin] = (await state()).users;
    assert.ok(admin);
    assert.equal((await runRecordSql(admin.id)).ok, true);
    assertGuardFailed(await runRecordSql(admin.id), "second run");
    const after = await state();
    assert.equal(after.records.length, 1);
    assert.equal(after.users.filter((u) => u.role === "admin").length, 1);
    assert.equal(
      after.accounts.filter((a) => a.providerId === "credential").length,
      1,
    );
    assert.equal((await runCli(cliArgs(), PASSWORD)).code, 2);
  });
});
