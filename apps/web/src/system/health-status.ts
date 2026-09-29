import type { HealthResult } from "../db/health.ts";

export interface HealthView {
  tone: "ok" | "error";
  summary: string;
  detail: string;
}

// Maps the real health result to fixed, user-facing Spanish copy. Only fixed
// strings and the migrations count are ever shown — never raw error text.
export function describeHealth(result: HealthResult): HealthView {
  switch (result.failure) {
    case undefined: {
      const n = result.body.migrations;
      const count = typeof n === "number" ? n : 0;
      return {
        tone: "ok",
        summary: "Base de datos conectada",
        detail:
          count === 1
            ? "1 migración aplicada"
            : `${count} migraciones aplicadas`,
      };
    }
    case "database_unavailable":
      return {
        tone: "error",
        summary: "Base de datos sin conexión",
        detail: "No se pudo conectar con la base de datos",
      };
    case "migrations_unavailable":
      return {
        tone: "error",
        summary: "Base de datos conectada",
        detail: "No se pudo leer el estado de las migraciones",
      };
    case "migrations_pending":
      return {
        tone: "error",
        summary: "Base de datos conectada",
        detail: "Migraciones pendientes",
      };
  }
}

// Fallback for an unexpected failure of the check itself (an exception that
// escapes checkDatabaseHealth). Connection and configuration errors thrown
// by the query callback, such as getPool() failing, never reach here: they
// are reported as "database_unavailable" by checkDatabaseHealth.
export function describeHealthError(): HealthView {
  return {
    tone: "error",
    summary: "Base de datos sin conexión",
    detail: "No se pudo comprobar el estado",
  };
}
