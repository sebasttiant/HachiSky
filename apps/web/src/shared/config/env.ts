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

function invalidKeysMessage(error: z.ZodError): string {
  const keys = [
    ...new Set(error.issues.map((issue) => issue.path.join(".") || "(root)")),
  ];
  return `Invalid environment configuration: missing or invalid keys: ${keys.join(", ")}`;
}

// Parses process.env into a typed, validated configuration. Pure function of
// its `source` argument so it can be unit tested without touching the real
// process.env. Error messages name the offending keys only — never the
// values — so a thrown error can be logged safely.
export function loadEnv(source: EnvSource = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(invalidKeysMessage(result.error));
  }
  return result.data;
}

// Auth configuration is validated separately from the database environment so
// services that only need the database (the migrator) do not have to carry
// auth secrets.
const authEnvSchema = z
  .object({
    APP_ENV: z.enum(APP_ENV_VALUES),
    // Origin only: a path, query, hash or credentials would change how Better
    // Auth derives its base path and cookie scope.
    BETTER_AUTH_URL: z
      .url({ protocol: /^https?$/ })
      .refine((value) => {
        // Refinements also run after a failed url() check.
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === "" &&
          url.username === "" &&
          url.password === ""
        );
      })
      .transform((value) => new URL(value).origin),
    BETTER_AUTH_SECRET: z.string().min(32),
  })
  .refine(
    (env) =>
      env.APP_ENV !== "production" || env.BETTER_AUTH_URL.startsWith("https:"),
    { path: ["BETTER_AUTH_URL"] },
  );

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function loadAuthEnv(source: EnvSource = process.env): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(invalidKeysMessage(result.error));
  }
  return result.data;
}
