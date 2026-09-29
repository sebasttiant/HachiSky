import { z } from "zod";

const APP_ENV_VALUES = ["development", "test", "production"] as const;

const envSchema = z.object({
  APP_ENV: z.enum(APP_ENV_VALUES),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
});

export type AppEnv = z.infer<typeof envSchema>;

// Plain string map instead of NodeJS.ProcessEnv: Next augments ProcessEnv
// with a required NODE_ENV, which would force every test fixture to set it.
export type EnvSource = Readonly<Record<string, string | undefined>>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

// Parses process.env into a typed, validated configuration. Pure function of
// its `source` argument so it can be unit tested without touching the real
// process.env. Error messages name the offending keys only — never the
// values — so a thrown error can be logged safely.
export function loadEnv(source: EnvSource = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [
      ...new Set(
        result.error.issues.map((issue) => issue.path.join(".") || "(root)"),
      ),
    ];
    throw new EnvValidationError(
      `Invalid environment configuration: missing or invalid keys: ${keys.join(", ")}`,
    );
  }
  return result.data;
}
