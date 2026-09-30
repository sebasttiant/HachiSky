import { EnvValidationError, loadAuthEnv } from "../shared/config/env.ts";

// Preflight for the `web` service: fails fast, before `next start`, when the
// auth environment is missing or invalid. Otherwise the server would start,
// pass its health check, and fail on the first page request instead.
//
// The message names the offending keys only (see loadAuthEnv), never values.
// Default exit code is 1 so any unexpected failure also stops the start.
process.exitCode = 1;
try {
  loadAuthEnv();
  process.exitCode = 0;
} catch (error) {
  const detail =
    error instanceof EnvValidationError ? error.message : "unexpected error";
  console.error(
    `web: auth configuration error: ${detail}. Set them in apps/web/.env (see README, "Signing in").`,
  );
}
