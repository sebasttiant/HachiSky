import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, sql } from "drizzle-orm";
import { Client, type ClientConfig } from "pg";
import { getDb } from "../db/client.ts";
import * as schema from "../db/schema/index.ts";
import { type AuthEnv, loadAuthEnv, loadEnv } from "../shared/config/env.ts";
import { type Auth, createAuth } from "./auth.ts";

// Arbitrary fixed 64-bit key reserved for the admin bootstrap.
export const BOOTSTRAP_LOCK_KEY = "7433201190041985002";

export const EXIT_CREATED = 0;
export const EXIT_USAGE = 1;
export const EXIT_ALREADY_BOOTSTRAPPED = 2;
export const EXIT_INCONSISTENT = 4;

export interface BootstrapInput {
  email: string;
  name: string;
  jobTitle: string;
  password: string;
}

export type BootstrapResult =
  | { exitCode: 0; outcome: "created"; userId: string }
  | { exitCode: 2; outcome: "already_bootstrapped" }
  | {
      exitCode: 4;
      outcome: "inconsistent";
      reason:
        | "admin_without_record"
        | "email_exists"
        | "create_failed"
        | "postcondition_failed"
        | "lock_lost"
        | "record_failed";
    }
  | { exitCode: 1; outcome: "error" };

export interface BootstrapHookContext {
  lockPid: number;
}

// Test seams that run between the steps. They exist so faults can be injected
// deterministically; the CLI never sets them.
export interface BootstrapHooks {
  beforeCreateUser?: (context: BootstrapHookContext) => Promise<void>;
  beforeRecord?: (context: BootstrapHookContext) => Promise<void>;
}

export interface BootstrapDeps {
  // Dedicated connection (never from the pool) that holds the advisory lock.
  client: Client;
  db: ReturnType<typeof getDb>;
  auth: Auth;
  hooks?: BootstrapHooks;
}

type InconsistentReason = Extract<
  BootstrapResult,
  { outcome: "inconsistent" }
>["reason"];

class Inconsistent extends Error {
  readonly reason: InconsistentReason;
  constructor(reason: InconsistentReason) {
    super(reason);
    this.reason = reason;
  }
}

// The lock client waits for the lock while another run creates the admin
// (password hashing included), so the pool's 4 s statement limit is too short.
export function buildLockClientConfig(): ClientConfig {
  const env = loadEnv();
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    connectionTimeoutMillis: 2000,
    statement_timeout: 60000,
    query_timeout: 60000,
  };
}

export function createBootstrapDeps(options: {
  authEnv?: AuthEnv;
  hooks?: BootstrapHooks;
}): BootstrapDeps {
  const db = getDb();
  return {
    client: new Client(buildLockClientConfig()),
    db,
    auth: createAuth({
      env: options.authEnv ?? loadAuthEnv(),
      database: drizzleAdapter(db, { provider: "pg", schema }),
      logger: { disabled: true },
    }),
    hooks: options.hooks,
  };
}

// Bootstraps the first administrator through Better Auth's own createUser.
//
// Guarantees, and non-guarantees, in order of importance:
// - Mutual exclusion is provided ONLY by a transaction-scoped advisory lock on
//   a dedicated connection. If that connection is lost, the lock is released
//   and another run may proceed: exclusion is NOT guaranteed after lock loss.
//   The postcondition (exactly one admin) then detects the damage and exits 4.
// - createUser runs on pool connections, not on the lock transaction. It is
//   therefore NOT atomic with the bootstrap record, nor is the user row atomic
//   with the credential account. A fault between steps leaves partial state
//   that later runs refuse (exit 4). Nothing is ever deleted or repaired here.
export async function runBootstrap(
  input: BootstrapInput,
  deps: BootstrapDeps,
): Promise<BootstrapResult> {
  const { client, db, auth, hooks } = deps;
  const email = input.email.trim().toLowerCase();
  let lost = false;
  let mutating = false;
  let committed = false;
  client.on("error", () => {
    lost = true;
  });
  const assertLockHeld = () => {
    if (lost) throw new Inconsistent("lock_lost");
  };

  try {
    await client.connect();
    const lockPid = (client as unknown as { processID: number }).processID;
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
      BOOTSTRAP_LOCK_KEY,
    ]);
    assertLockHeld();

    // 1. The record is checked first, so a deactivated admin still refuses.
    const record = await client.query("SELECT 1 FROM admin_bootstrap");
    if (record.rowCount && record.rowCount > 0) {
      return { exitCode: 2, outcome: "already_bootstrapped" };
    }

    // 2. Preconditions. No automatic adoption of anything that already exists.
    const [admins] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.user)
      .where(sql`'admin' = any(string_to_array(${schema.user.role}, ','))`);
    if ((admins?.n ?? 0) > 0) throw new Inconsistent("admin_without_record");
    const [sameEmail] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.user)
      .where(eq(schema.user.email, email));
    if ((sameEmail?.n ?? 0) > 0) throw new Inconsistent("email_exists");

    assertLockHeld();
    await hooks?.beforeCreateUser?.({ lockPid });

    // 3. Create through Better Auth (server-side, no session or headers).
    mutating = true;
    let createdId: string;
    try {
      const created = await auth.api.createUser({
        body: {
          email,
          password: input.password,
          name: input.name,
          role: "admin",
          data: { jobTitle: input.jobTitle },
        },
      });
      createdId = created.user.id;
    } catch {
      throw new Inconsistent("create_failed");
    }
    assertLockHeld();

    // 4. Postcondition, read back through the ORM.
    const admin = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`'admin' = any(string_to_array(${schema.user.role}, ','))`);
    const credentials = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, createdId),
          eq(schema.account.providerId, "credential"),
        ),
      );
    if (
      admin.length !== 1 ||
      admin[0]?.id !== createdId ||
      credentials.length !== 1
    ) {
      throw new Inconsistent("postcondition_failed");
    }

    await hooks?.beforeRecord?.({ lockPid });
    assertLockHeld();

    // 5. Record and commit on the lock connection.
    try {
      await client.query(
        "INSERT INTO admin_bootstrap (admin_user_id) VALUES ($1)",
        [createdId],
      );
      await client.query("COMMIT");
      committed = true;
    } catch {
      throw new Inconsistent(lost ? "lock_lost" : "record_failed");
    }
    return { exitCode: 0, outcome: "created", userId: createdId };
  } catch (error) {
    if (error instanceof Inconsistent) {
      return { exitCode: 4, outcome: "inconsistent", reason: error.reason };
    }
    // Anything else after the first write may have left state behind.
    if (mutating || lost) {
      return {
        exitCode: 4,
        outcome: "inconsistent",
        reason: lost ? "lock_lost" : "postcondition_failed",
      };
    }
    return { exitCode: 1, outcome: "error" };
  } finally {
    if (!committed) await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
