import Image from "next/image";
import { formatDate } from "../shared/format/date.ts";
import {
  formatDuration,
  formatHoursDecimal,
} from "../shared/format/duration.ts";
import { Wordmark } from "../shell/Wordmark.tsx";
import styles from "./ReportSheet.module.css";
import { reportTotals, sampleReport } from "./sample-report.ts";

export function ReportSheet() {
  const report = sampleReport;
  const totals = reportTotals(report);
  return (
    <article className={styles.sheet} aria-labelledby="report-title">
      <header className={styles.head}>
        <div className={styles.brand}>
          <Image
            className={styles.logo}
            src="/brand/hachisky-mark.png"
            alt=""
            width={512}
            height={506}
            unoptimized
          />
          <div>
            <Wordmark size="sm" />
            <p className={styles.by}>by IL Asesorías</p>
          </div>
        </div>
        <div className={styles.titleBlock}>
          <p className={styles.stamp}>Informe de ejemplo</p>
          <h2 id="report-title">{report.title}</h2>
          <p className={styles.ref}>Ref. {report.reference}</p>
        </div>
      </header>

      <dl className={styles.meta}>
        <div>
          <dt>Cliente</dt>
          <dd>{report.client.name}</dd>
        </div>
        <div>
          <dt>Contacto</dt>
          <dd>{report.client.contact}</dd>
        </div>
        <div>
          <dt>Período</dt>
          <dd>
            {formatDate(report.period.from)} – {formatDate(report.period.to)}
          </dd>
        </div>
        <div>
          <dt>Elaborado por</dt>
          <dd>{report.professional}</dd>
        </div>
      </dl>

      <table className={styles.table}>
        <caption>Actividades realizadas en el período</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Actividad</th>
            <th scope="col" className={styles.num}>
              Duración
            </th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((line) => (
            <tr key={`${line.date}-${line.description}`}>
              <td className={styles.date}>{formatDate(line.date)}</td>
              <td>{line.description}</td>
              <td className={styles.num}>{formatDuration(line.minutes)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total de horas ({totals.lines} actividades)
            </th>
            <td className={styles.num}>
              <strong>{formatDuration(totals.minutes)}</strong>
              <span className={styles.decimal}>
                {formatHoursDecimal(totals.minutes)} h
              </span>
            </td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.signatures}>
        <div>
          <span className={styles.line} />
          <p>Firma del asesor</p>
        </div>
        <div>
          <span className={styles.line} />
          <p>Conformidad del cliente</p>
        </div>
      </div>

      <footer className={styles.foot}>HachiSky by IL Asesorías</footer>
    </article>
  );
}
