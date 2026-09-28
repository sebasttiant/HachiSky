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
    console.error("Health check could not run");
    return describeHealthError();
  }
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
