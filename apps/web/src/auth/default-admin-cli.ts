import { closeDb } from "../db/client.ts";
import { createBootstrapDeps, EXIT_USAGE } from "./bootstrap-admin.ts";
import {
  type DefaultAdminResult,
  ensureDefaultAdmin,
  PASSWORD_FILE,
} from "./default-admin.ts";

// Startup step (compose service `init-admin`): creates the default
// administrator on a fresh installation. See README "Default administrator".
//
// Environment: PG*, BETTER_AUTH_URL, BETTER_AUTH_SECRET, APP_ENV and
// HACHISKY_SECRETS_DIR (default /run/hachisky-secrets).
//
// Output is ONE status line. It never contains the password.
//
// Exit codes:
//   0  created, or already initialized (nothing done)
//   1  configuration error, unusable secrets directory, or an error before
//      anything was written
//   3  the password file already exists but the system is not initialized;
//      nothing done (move or delete the file, then start again)
//   4  inconsistent: the bootstrap stopped part-way; see the reason and the
//      README (a temporary password file may hold the password)

const DEFAULT_SECRETS_DIR = "/run/hachisky-secrets";

function describe(result: DefaultAdminResult): string {
  switch (result.outcome) {
    case "created":
      return `created; password in secrets/${PASSWORD_FILE}`;
    case "already_initialized":
      return "already initialized";
    case "inconsistent":
      return `inconsistent (${result.reason})`;
    default:
      return result.outcome;
  }
}

function report(status: string): void {
  console.log(`default-admin: ${status}`);
}

async function main(): Promise<void> {
  const secretsDir =
    process.env.HACHISKY_SECRETS_DIR?.trim() || DEFAULT_SECRETS_DIR;
  try {
    const result = await ensureDefaultAdmin(createBootstrapDeps({}), {
      secretsDir,
    });
    report(describe(result));
    process.exitCode = result.exitCode;
  } catch {
    // Configuration errors (auth or database environment) land here.
    report("configuration_error");
    process.exitCode = EXIT_USAGE;
  } finally {
    await closeDb();
  }
}

// Dedicated entry file: main() always runs (see bootstrap-admin-cli.ts for
// why there is no main-module check). Non-zero until main() sets the result.
process.exitCode = EXIT_USAGE;
await main();
