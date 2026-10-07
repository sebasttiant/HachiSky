import { randomBytes, randomInt } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema/index.ts";
import {
  type BootstrapDeps,
  type BootstrapResult,
  runBootstrap,
} from "./bootstrap-admin.ts";

// The administrator every fresh installation starts with. Its password is
// random per installation and handed to the owner through a local file.
export const DEFAULT_ADMIN = {
  email: "admin@ilasesorias.com",
  name: "Administrador",
  jobTitle: "Administrador",
} as const;

export const PASSWORD_FILE = "initial-admin-password";

// No 0/O, 1/l/I: the owner may have to type it from a terminal.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
// 32 characters of a 57-symbol alphabet is about 186 bits; Better Auth
// accepts 8 to 128 characters.
const PASSWORD_LENGTH = 32;

export function generateInitialPassword(): string {
  let password = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}

type InconsistentReason =
  | Extract<BootstrapResult, { outcome: "inconsistent" }>["reason"]
  | "must_change_failed"
  | "password_file_failed";

export type DefaultAdminResult =
  | { exitCode: 0; outcome: "created"; userId: string }
  | { exitCode: 0; outcome: "already_initialized" }
  | { exitCode: 1; outcome: "error" }
  | { exitCode: 1; outcome: "secrets_dir_unusable" }
  | { exitCode: 3; outcome: "password_file_exists" }
  | { exitCode: 4; outcome: "inconsistent"; reason: InconsistentReason };

export interface DefaultAdminOptions {
  secretsDir: string;
  generatePassword?: () => string;
}

// Bootstrap reasons raised before anything was written: the temporary file
// holds a password no account uses, so it is removed.
const PRE_WRITE_REASONS = new Set<InconsistentReason>(["email_exists"]);

async function isInitialized(db: BootstrapDeps["db"]): Promise<boolean> {
  const [records] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.adminBootstrap);
  if ((records?.n ?? 0) > 0) return true;
  // Same admin test as runBootstrap's precondition.
  const [admins] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.user)
    .where(sql`'admin' = any(string_to_array(${schema.user.role}, ','))`);
  return (admins?.n ?? 0) > 0;
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// Exclusive create, 0600 regardless of the umask, flushed before the account
// exists so the password is on disk before it can be needed.
async function writeSecret(file: string, content: string): Promise<void> {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(`${content}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Creates the default administrator on a fresh installation.
//
// Rules, in order:
// 1. Initialized means a bootstrap record exists or ANY admin exists. Then
//    nothing is done: no directory, no file, no password change (exit 0).
// 2. The secrets directory is created 0700 (or tightened to 0700).
// 3. If the final password file already exists while the system is NOT
//    initialized, it is refused (exit 3) and the file is left as is. That file
//    belongs to some earlier installation (for example a database that was
//    recreated); overwriting it silently would destroy a password someone may
//    still rely on, and keeping it would point the owner at a wrong password.
//    The operator decides: move or delete it, then start again.
// 4. The password is written FIRST to a per-run temporary file, then the
//    admin is created through runBootstrap (same lock and guarantees as the
//    stdin CLI), flagged must-change, and the file is renamed into place.
//    A unique temporary name keeps concurrent runs from overwriting each
//    other's password; only the run that created the admin renames.
// 5. On failure the final file is never written. The temporary file is
//    removed when no account can be using its password (nothing was created);
//    it is KEPT when an account may already use it, since it is then the only
//    copy of that password. Users and data are never deleted or repaired.
export async function ensureDefaultAdmin(
  deps: BootstrapDeps,
  options: DefaultAdminOptions,
): Promise<DefaultAdminResult> {
  if (await isInitialized(deps.db)) {
    return { exitCode: 0, outcome: "already_initialized" };
  }

  const dir = options.secretsDir;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
  } catch {
    return { exitCode: 1, outcome: "secrets_dir_unusable" };
  }

  const finalFile = path.join(dir, PASSWORD_FILE);
  if (await exists(finalFile)) {
    return { exitCode: 3, outcome: "password_file_exists" };
  }

  const password = (options.generatePassword ?? generateInitialPassword)();
  const tmpFile = path.join(
    dir,
    `${PASSWORD_FILE}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeSecret(tmpFile, password);
  } catch {
    await rm(tmpFile, { force: true }).catch(() => undefined);
    return { exitCode: 1, outcome: "secrets_dir_unusable" };
  }
  const discardTmp = () => rm(tmpFile, { force: true }).catch(() => undefined);

  const result = await runBootstrap({ ...DEFAULT_ADMIN, password }, deps);

  if (result.outcome !== "created") {
    // Another run (or an operator) initialized the system meanwhile.
    if (
      result.outcome === "already_bootstrapped" ||
      (result.outcome === "inconsistent" &&
        result.reason === "admin_without_record")
    ) {
      await discardTmp();
      return { exitCode: 0, outcome: "already_initialized" };
    }
    if (result.outcome === "error") {
      await discardTmp();
      return { exitCode: 1, outcome: "error" };
    }
    if (PRE_WRITE_REASONS.has(result.reason)) await discardTmp();
    return { exitCode: 4, outcome: "inconsistent", reason: result.reason };
  }

  // Same mechanism as an admin-created user: the first sign-in must replace
  // the password the file holds.
  try {
    await deps.db
      .insert(schema.userSecurity)
      .values({ userId: result.userId, mustChangePassword: true })
      .onConflictDoUpdate({
        target: schema.userSecurity.userId,
        set: { mustChangePassword: true },
      });
  } catch {
    return {
      exitCode: 4,
      outcome: "inconsistent",
      reason: "must_change_failed",
    };
  }

  try {
    await rename(tmpFile, finalFile);
  } catch {
    return {
      exitCode: 4,
      outcome: "inconsistent",
      reason: "password_file_failed",
    };
  }
  return { exitCode: 0, outcome: "created", userId: result.userId };
}
