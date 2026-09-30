import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb } from "../db/client.ts";
import {
  type BootstrapInput,
  createBootstrapDeps,
  EXIT_USAGE,
  runBootstrap,
} from "./bootstrap-admin.ts";

// Usage:
//   printf '%s' "$PASSWORD" | node src/auth/bootstrap-admin-cli.ts \
//     --email <email> --name <full name> --job-title <title>
//
// The password is read from stdin ONLY: never from argv, the environment or a
// prompt. Output is a single status line; it never contains the password, the
// SQL, or an error message.

const argsSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(200),
  "job-title": z.string().trim().min(1).max(100),
});

const passwordSchema = z.string().min(8).max(128);

type CliParse =
  | { ok: true; email: string; name: string; jobTitle: string }
  | { ok: false };

function parseCliArgs(argv: string[]): CliParse {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        name: { type: "string" },
        "job-title": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    });
    const parsed = argsSchema.safeParse(values);
    if (!parsed.success) return { ok: false };
    return {
      ok: true,
      email: parsed.data.email,
      name: parsed.data.name,
      jobTitle: parsed.data["job-title"],
    };
  } catch {
    return { ok: false };
  }
}

async function readStdin(): Promise<string> {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

// Removes exactly one trailing line ending, so `echo` and `printf` both work
// without altering passwords that legitimately contain spaces.
function stripTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function report(status: string): void {
  console.log(`bootstrap-admin: ${status}`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.ok || process.stdin.isTTY) {
    report("usage_error");
    process.exitCode = EXIT_USAGE;
    return;
  }
  const password = stripTrailingNewline(await readStdin());
  if (!passwordSchema.safeParse(password).success) {
    report("usage_error");
    process.exitCode = EXIT_USAGE;
    return;
  }
  const input: BootstrapInput = {
    email: args.email,
    name: args.name,
    jobTitle: args.jobTitle,
    password,
  };
  try {
    const result = await runBootstrap(input, createBootstrapDeps({}));
    report(
      result.outcome === "inconsistent"
        ? `inconsistent (${result.reason})`
        : result.outcome,
    );
    process.exitCode = result.exitCode;
  } catch {
    // Configuration errors (auth or database environment) land here.
    report("configuration_error");
    process.exitCode = EXIT_USAGE;
  } finally {
    await closeDb();
  }
}

// Dedicated entry file: main() ALWAYS runs when this module is loaded. There is
// deliberately no "is this the main module" comparison, because a mismatch
// (spaces or encoded characters in the path, symlinks) would skip main() and
// exit 0 without doing anything. The default exit code is non-zero, so even a
// crash before main() reports failure; main() sets the real code on every path.
process.exitCode = EXIT_USAGE;
await main();
