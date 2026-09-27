// A query function injectable by callers so this module stays a pure,
// unit-testable core: it never opens a connection itself.
export type HealthQuery = (
  sql: string,
) => Promise<{ rows: Array<Record<string, unknown>> }>;

const HEALTH_FAILURE = {
  DATABASE_UNAVAILABLE: "database_unavailable",
  MIGRATIONS_UNAVAILABLE: "migrations_unavailable",
  MIGRATIONS_PENDING: "migrations_pending",
} as const;

export type HealthFailure =
  (typeof HEALTH_FAILURE)[keyof typeof HEALTH_FAILURE];

export interface HealthBody {
  status: "ok" | "error";
  database: "ok" | "unavailable";
  migrations?: number | "unavailable" | "pending";
}

export interface HealthResult {
  httpStatus: 200 | 503;
  body: HealthBody;
  failure?: HealthFailure;
}

function readCount(row: Record<string, unknown> | undefined): number {
  const raw = row?.count;
  return typeof raw === "string" || typeof raw === "number" ? Number(raw) : 0;
}

// Note: "migrations >= 1 applied" only proves the migrator has run and
// committed at least one migration. It does NOT prove every migration in
// the local drizzle journal has been applied — that would require comparing
// the applied count (or hashes) against the journal file, which this check
// does not do yet.
export async function checkDatabaseHealth(
  query: HealthQuery,
): Promise<HealthResult> {
  try {
    await query("select 1");
  } catch {
    return {
      httpStatus: 503,
      body: { status: "error", database: "unavailable" },
      failure: HEALTH_FAILURE.DATABASE_UNAVAILABLE,
    };
  }

  let migrations: number;
  try {
    const result = await query(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    migrations = readCount(result.rows[0]);
  } catch {
    return {
      httpStatus: 503,
      body: { status: "error", database: "ok", migrations: "unavailable" },
      failure: HEALTH_FAILURE.MIGRATIONS_UNAVAILABLE,
    };
  }

  if (migrations < 1) {
    return {
      httpStatus: 503,
      body: { status: "error", database: "ok", migrations: "pending" },
      failure: HEALTH_FAILURE.MIGRATIONS_PENDING,
    };
  }

  return {
    httpStatus: 200,
    body: { status: "ok", database: "ok", migrations },
  };
}
