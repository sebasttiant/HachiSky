import { formatAmount } from "../billing/money.ts";
import { getDb } from "../db/client.ts";
import styles from "./DashboardMetrics.module.css";
import { type DashboardActor, getDashboardMetrics } from "./metrics.ts";

// Every figure below is a count or a sum read from the database. Trabajo and
// Informes are still previews with sample data, so they contribute no metric:
// inventing one would be worse than showing nothing.

export function DashboardMetricsFallback() {
  return (
    <section
      className={styles.panel}
      aria-labelledby="metrics-title"
      aria-busy="true"
    >
      <h2 id="metrics-title" className={styles.title}>
        Resumen
      </h2>
      <p role="status" className={styles.pending}>
        Consultando datos…
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}

export async function DashboardMetrics({ actor }: { actor: DashboardActor }) {
  const metrics = await getDashboardMetrics({ db: getDb() }, actor);
  const { clients, drafts, team, billingSetup } = metrics;
  const inactive = clients.total - clients.active;
  const setupMissing =
    (billingSetup.issuers === 0 ? 1 : 0) +
    (billingSetup.signers === 0 ? 1 : 0) +
    (billingSetup.bankAccounts === 0 ? 1 : 0) +
    (billingSetup.declarations === 0 ? 1 : 0);

  return (
    <section className={styles.panel} aria-labelledby="metrics-title">
      <h2 id="metrics-title" className={styles.title}>
        Resumen
      </h2>

      <div className={styles.grid}>
        <Metric
          label="Clientes activos"
          value={String(clients.active)}
          hint={
            inactive > 0
              ? `${inactive} inactivo${inactive === 1 ? "" : "s"}`
              : "Ninguno inactivo"
          }
        />
        <Metric
          label="Borradores en curso"
          value={String(drafts.count)}
          hint={
            drafts.count === 0 ? "Sin borradores" : "Sin número hasta emitirlos"
          }
        />
        <Metric
          label="Equipo"
          value={String(team.total)}
          hint={`${team.total === 1 ? "Persona" : "Personas"} con acceso`}
        />
        <Metric
          label="Configuración de facturación"
          value={setupMissing === 0 ? "Completa" : `Faltan ${setupMissing}`}
          hint={`${billingSetup.issuers} emisor(es) · ${billingSetup.signers} firmante(s) · ${billingSetup.bankAccounts} cuenta(s) · ${billingSetup.declarations} declaración(es)`}
        />

        {/* One more figure in the same row. It used to be a panel of its own,
            which reserved a block of empty page to say "$ 0". */}
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Valor en borradores</span>
          {drafts.totals.length === 0 ? (
            <>
              <span className={styles.metricValue}>—</span>
              <span className={styles.metricHint}>Sin valores cargados</span>
            </>
          ) : (
            <>
              <ul className={styles.totalsList}>
                {drafts.totals.map((total) => (
                  <li key={total.currency} className={styles.total}>
                    <span className={styles.totalValue}>
                      {formatAmount(total.totalMinor, total.currency)}
                    </span>
                    <span className={styles.totalCurrency}>
                      {total.currency}
                    </span>
                  </li>
                ))}
              </ul>
              <span className={styles.metricHint}>
                Cada moneda por separado; nunca se suman entre sí.
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
