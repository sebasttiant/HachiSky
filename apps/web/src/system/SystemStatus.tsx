import { getPool } from "../db/client.ts";
import { checkDatabaseHealth } from "../db/health.ts";
import {
  describeHealth,
  describeHealthError,
  type HealthView,
} from "./health-status.ts";
import styles from "./SystemStatus.module.css";

async function readHealth(): Promise<HealthView> {
  try {
    const result = await checkDatabaseHealth((sql) => getPool().query(sql));
    if (result.failure) {
      // Fixed message with only the failure category, like /api/health.
      console.error(`Health check failed: ${result.failure}`);
    }
    return describeHealth(result);
  } catch {
    // getPool() failures (e.g. invalid configuration) are thrown inside the
    // callback above and reported by checkDatabaseHealth as
    // "database_unavailable". This catch only covers an unexpected failure of
    // the check itself.
    console.error("Health check could not run");
    return describeHealthError();
  }
}

// Shown while the database check runs, so the rest of the page is not blocked.
export function SystemStatusFallback() {
  return (
    <section
      className={styles.panel}
      aria-labelledby="system-title"
      aria-busy="true"
    >
      <h2 id="system-title">Estado del sistema</h2>
      <p role="status" className={styles.pending}>
        Consultando estado…
      </p>
    </section>
  );
}

export async function SystemStatus() {
  const view = await readHealth();
  return (
    <section className={styles.panel} aria-labelledby="system-title">
      <h2 id="system-title">Estado del sistema</h2>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Aplicación</dt>
          <dd>
            <span className={`${styles.dot} ${styles.ok}`} aria-hidden="true" />
            En ejecución
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Base de datos</dt>
          <dd>
            <span
              className={`${styles.dot} ${view.tone === "ok" ? styles.ok : styles.error}`}
              aria-hidden="true"
            />
            <span>
              {view.summary} <span aria-hidden="true">·</span> {view.detail}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
