import { formatDate } from "../shared/format/date.ts";
import styles from "./ReportSheet.module.css";
import type { ItemRecord, ReportRecord, SectionRecord } from "./service.ts";
import {
  ITEM_PRIORITY_LABEL,
  ITEM_STATUS_LABEL,
  REPORT_TYPE_LABEL,
} from "./templates.ts";

// The report as a document: what the client is handed, not the form the
// author fills in. Everything that has content prints, in template order —
// there is no collapsing here, so nothing can be left out by accident.

function period(report: ReportRecord) {
  const { periodStart, periodEnd } = report;
  if (!periodStart && !periodEnd) return null;
  if (periodStart && periodEnd) {
    return `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;
  }
  return periodStart
    ? `Desde ${formatDate(periodStart)}`
    : `Hasta ${formatDate(periodEnd as string)}`;
}

function StatusChip({ status }: { status: ItemRecord["status"] }) {
  if (!status) return null;
  return (
    <span className={`${styles.chip} ${styles[`status_${status}`]}`}>
      {ITEM_STATUS_LABEL[status]}
    </span>
  );
}

function PriorityChip({ priority }: { priority: ItemRecord["priority"] }) {
  if (!priority) return null;
  return (
    <span className={`${styles.chip} ${styles[`priority_${priority}`]}`}>
      {ITEM_PRIORITY_LABEL[priority]}
    </span>
  );
}

function Findings({ items }: { items: readonly ItemRecord[] }) {
  return (
    <ol className={styles.findings}>
      {items.map((item) => (
        <li key={item.id} className={styles.finding}>
          <div className={styles.findingHead}>
            <strong>{item.label}</strong>
            <PriorityChip priority={item.priority} />
          </div>
          {item.impact ? (
            <p className={styles.impact}>
              <span className={styles.impactLabel}>Impacto:</span> {item.impact}
            </p>
          ) : null}
          {item.body ? <p className={styles.body}>{item.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function StatusTable({ items }: { items: readonly ItemRecord[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Dominio</th>
          <th scope="col">Estado</th>
          <th scope="col">Observación</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.label}</strong>
            </td>
            <td>
              <StatusChip status={item.status} />
            </td>
            <td>{item.body}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Inventory({ items }: { items: readonly ItemRecord[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Elemento</th>
          <th scope="col">Detalle</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <strong>{item.label}</strong>
            </td>
            <td>{item.body}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Steps({ items }: { items: readonly ItemRecord[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.label}</strong>
          {item.body ? <p className={styles.body}>{item.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function Section({ section }: { section: SectionRecord }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeading}>{section.heading}</h2>
      {section.kind === "prose" ? (
        <p className={styles.body}>{section.body}</p>
      ) : section.kind === "findings" ? (
        <Findings items={section.items} />
      ) : section.kind === "status_table" ? (
        <StatusTable items={section.items} />
      ) : section.kind === "inventory" ? (
        <Inventory items={section.items} />
      ) : (
        <Steps items={section.items} />
      )}
    </section>
  );
}

/** A section with nothing in it is not a section yet. */
function hasContent(section: SectionRecord) {
  return section.kind === "prose"
    ? section.body !== null && section.body.trim() !== ""
    : section.items.length > 0;
}

export function ReportSheet({ report }: { report: ReportRecord }) {
  const span = period(report);
  // Empty sections are left out: a document handed to a client does not show
  // hollow headings. The editing screen is where the gaps are visible.
  const sections = report.sections.filter(hasContent);

  return (
    <article className={styles.sheet}>
      <div className={styles.worlds} aria-hidden="true" />

      <header className={styles.top}>
        <p className={styles.kind}>{REPORT_TYPE_LABEL[report.type]}</p>
        <h1 className={styles.title}>{report.title}</h1>
        <dl className={styles.facts}>
          <div>
            <dt>Cliente</dt>
            <dd>{report.clientName}</dd>
          </div>
          {span ? (
            <div>
              <dt>Período</dt>
              <dd>{span}</dd>
            </div>
          ) : null}
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={styles.draft}>Borrador</span>
            </dd>
          </div>
        </dl>
      </header>

      {sections.length === 0 ? (
        <p className={styles.empty}>
          Este informe todavía no tiene contenido. Llena sus secciones y vuelve
          a verlo.
        </p>
      ) : (
        sections.map((section) => (
          <Section key={section.key} section={section} />
        ))
      )}

      {report.activities.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Actividades registradas</h2>
          {/* Read from Trabajo, never typed here: the report describes work
              somebody recorded. */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Horario</th>
                <th scope="col">Actividad</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {report.activities.map((activity) => (
                <tr key={activity.id}>
                  <td>{formatDate(activity.performedOn)}</td>
                  <td>
                    {activity.startedAt && activity.endedAt
                      ? `${activity.startedAt}–${activity.endedAt}`
                      : "Sin horario"}
                  </td>
                  <td>
                    <strong>{activity.title}</strong>
                  </td>
                  <td>{activity.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <footer className={styles.bottom}>
        <div className={styles.signature}>
          <p className={styles.signatureName}>{report.authorName}</p>
          {report.authorJobTitle ? (
            <p className={styles.signatureRole}>{report.authorJobTitle}</p>
          ) : null}
        </div>
        <p className={styles.generated}>
          Generado desde la plataforma HachiSky
        </p>
      </footer>
    </article>
  );
}
