import Link from "next/link";
import { formatDate } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";
import { NEW_REPORT_PATH, reportPath } from "./paths.ts";
import type { ReportSummary } from "./service.ts";
import { REPORT_TYPE_LABEL } from "./templates.ts";

function period(report: ReportSummary) {
  const { periodStart, periodEnd } = report;
  if (!periodStart && !periodEnd) return "Sin período";
  if (periodStart && periodEnd) {
    return `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;
  }
  // One open end is normal: a diagnóstico describes a moment.
  return periodStart
    ? `Desde ${formatDate(periodStart)}`
    : `Hasta ${formatDate(periodEnd as string)}`;
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay informes</h2>
      <p>
        No es un error: cuando escribas uno a partir del trabajo registrado
        aparecerá aquí.
      </p>
      <Link
        href={NEW_REPORT_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nuevo informe
      </Link>
    </div>
  );
}

// Cards on small screens, a table on desktop, matching the other lists.
export function ReportList({ items }: { items: readonly ReportSummary[] }) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((report) => (
          <li key={report.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{report.title}</strong>
              <span className={styles.muted}>{report.clientName}</span>
              <span>
                {REPORT_TYPE_LABEL[report.type]} · {period(report)}
              </span>
            </div>
            <div className={styles.badges}>
              {report.status === "issued" ? (
                <span className={`${styles.badge} ${styles.badgeActive}`}>
                  Emitido
                </span>
              ) : (
                <span className={`${styles.badge} ${styles.badgePending}`}>
                  Borrador
                </span>
              )}
            </div>
            <Link
              href={reportPath(report.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Abrir el informe ${report.title}`}
            >
              Abrir
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Informe</th>
              <th scope="col">Tipo</th>
              <th scope="col">Período</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((report) => (
              <tr key={report.id}>
                <td>
                  <strong>{report.clientName}</strong>
                </td>
                <td>{report.title}</td>
                <td>{REPORT_TYPE_LABEL[report.type]}</td>
                <td>{period(report)}</td>
                <td>
                  {report.status === "issued" ? (
                    <span className={`${styles.badge} ${styles.badgeActive}`}>
                      Emitido
                    </span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgePending}`}>
                      Borrador
                    </span>
                  )}
                </td>
                <td>
                  <Link
                    href={reportPath(report.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Abrir el informe ${report.title}`}
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
