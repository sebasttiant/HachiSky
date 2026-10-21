import { formatDate } from "../shared/format/date.ts";
import type { ReportImageRecord } from "./images.ts";
import { reportIdentityImagePath, reportImagePath } from "./paths.ts";
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

/** "08:30" → minutes since midnight; anything else does not count. */
function minutesOf(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The hours the recorded activities actually carry. An activity without
 * both times contributes nothing: the document never invents a duration.
 */
function recordedHoursLabel(
  activities: ReportRecord["activities"],
): string | null {
  let total = 0;
  for (const activity of activities) {
    const start = minutesOf(activity.startedAt);
    const end = minutesOf(activity.endedAt);
    if (start !== null && end !== null && end > start) total += end - start;
  }
  if (total === 0) return null;
  const hours = total / 60;
  return Number.isInteger(hours)
    ? `${hours} h`
    : `${hours.toFixed(1).replace(".", ",")} h`;
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

// The figures of a section, printed where they belong: the screenshot of a
// step sits under that step, not in an appendix the reader has to hunt for.
//
// The title is printed as well as the image, so a numbered reference in the
// text still means something on paper, and a figure that fails to load is
// still named instead of leaving a blank.
function Figures({ images }: { images: readonly ReportImageRecord[] }) {
  if (images.length === 0) return null;
  return (
    <div className={styles.figures}>
      {images.map((image) => (
        <figure key={image.id} className={styles.figure}>
          {/* biome-ignore lint/performance/noImgElement: private figure served by an authenticated route; next/image would proxy it through the public optimizer */}
          <img
            className={styles.figureImage}
            src={reportImagePath(image.id)}
            alt={image.title}
            width={image.width}
            height={image.height}
          />
          <figcaption className={styles.figureCaption}>
            <span className={styles.figureTitle}>{image.title}</span>
            {image.caption ? (
              <span className={styles.figureText}>{image.caption}</span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Section({
  section,
  images,
  number,
}: {
  section: SectionRecord;
  images: readonly ReportImageRecord[];
  number: number;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionNumber} aria-hidden="true">
          {String(number).padStart(2, "0")}
        </span>
        <h2 className={styles.sectionHeading}>{section.heading}</h2>
      </div>
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
      <Figures images={images} />
    </section>
  );
}

/**
 * A section with nothing in it is not a section yet.
 *
 * A figure counts: a step explained entirely by its screenshot has said
 * everything it had to say, and dropping it would lose exactly that.
 */
function hasContent(
  section: SectionRecord,
  images: readonly ReportImageRecord[],
) {
  if (images.length > 0) return true;
  return section.kind === "prose"
    ? section.body !== null && section.body.trim() !== ""
    : section.items.length > 0;
}

export function ReportSheet({
  report,
  images,
}: {
  report: ReportRecord;
  images: readonly ReportImageRecord[];
}) {
  const span = period(report);
  // Figures hang off their section, and they print in the order the author
  // put them in.
  const bySection = new Map<string, ReportImageRecord[]>();
  for (const image of [...images].sort((a, b) => a.position - b.position)) {
    const current = bySection.get(image.sectionKey);
    if (current) current.push(image);
    else bySection.set(image.sectionKey, [image]);
  }
  // Empty sections are left out: a document handed to a client does not show
  // hollow headings. The editing screen is where the gaps are visible.
  const sections = report.sections.filter((section) =>
    hasContent(section, bySection.get(section.key) ?? []),
  );

  // The two follow_up kinds the owner writes: detailed carries the recorded
  // activities with their dates, times and hours; summary ("solo datos")
  // prints the report facts and its sections, nothing counted.
  const isFollowUp = report.type === "follow_up";
  const detailed = !isFollowUp || report.detailLevel === "detailed";
  const showActivities = detailed && report.activities.length > 0;
  const hoursLabel =
    isFollowUp && detailed ? recordedHoursLabel(report.activities) : null;

  return (
    <article className={styles.sheet}>
      <div className={styles.worlds} aria-hidden="true" />

      {/* The provider's letterhead: its logo and name, never the platform's.
          Change the provider and the document changes its letterhead. */}
      <header className={styles.brand}>
        <div className={styles.brandIdentity}>
          {report.provider?.logoImageId ? (
            // biome-ignore lint/performance/noImgElement: private logo served by an authenticated route; next/image would proxy it through the public optimizer
            <img
              className={styles.brandLogo}
              src={reportIdentityImagePath(report.provider.logoImageId)}
              alt={report.provider.name}
            />
          ) : null}
          {report.provider ? (
            <p className={styles.brandName}>{report.provider.name}</p>
          ) : null}
        </div>
        <p className={styles.brandMeta}>{REPORT_TYPE_LABEL[report.type]}</p>
      </header>

      <div className={styles.hero}>
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
            <dt>Autor</dt>
            <dd>{report.authorName}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              {report.status === "issued" ? (
                <span className={styles.stateIssued}>
                  Emitido
                  {report.issuedAt
                    ? ` · ${formatDate(report.issuedAt.toISOString().slice(0, 10))}`
                    : ""}
                </span>
              ) : (
                <span className={styles.draft}>Borrador</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {isFollowUp && detailed && report.activities.length > 0 ? (
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className={styles.kpiValue}>{report.activities.length}</span>
            <span className={styles.kpiLabel}>Actividades registradas</span>
          </div>
          {hoursLabel ? (
            <div className={styles.kpi}>
              <span className={styles.kpiValue}>{hoursLabel}</span>
              <span className={styles.kpiLabel}>Horas registradas</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {sections.length === 0 && !showActivities ? (
        <p className={styles.empty}>
          Este informe todavía no tiene contenido. Llena sus secciones y vuelve
          a verlo.
        </p>
      ) : (
        <>
          {sections.map((section, index) => (
            <Section
              key={section.key}
              section={section}
              number={index + 1}
              images={bySection.get(section.key) ?? []}
            />
          ))}

          {showActivities ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionNumber} aria-hidden="true">
                  {String(sections.length + 1).padStart(2, "0")}
                </span>
                <h2 className={styles.sectionHeading}>
                  Actividades registradas
                </h2>
              </div>
              {/* Read from Trabajo, never typed here: the report describes
                  work somebody recorded. */}
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
        </>
      )}

      <footer className={styles.bottom}>
        <div className={styles.signature}>
          {report.signer?.signatureImageId ? (
            // biome-ignore lint/performance/noImgElement: private signature served by an authenticated route; next/image would proxy it through the public optimizer
            <img
              className={styles.signatureImage}
              src={reportIdentityImagePath(report.signer.signatureImageId)}
              alt={`Firma de ${report.signer.name}`}
            />
          ) : null}
          <p className={styles.signatureName}>
            {report.signer?.name ?? report.authorName}
          </p>
          {report.signer ? (
            <p className={styles.signatureId}>
              {report.signer.identificationType}{" "}
              {report.signer.identificationNumber}
            </p>
          ) : null}
          {report.signer?.jobTitle || report.authorJobTitle ? (
            <p className={styles.signatureRole}>
              {report.signer?.jobTitle ?? report.authorJobTitle}
            </p>
          ) : null}
          {report.provider ? (
            <p className={styles.signatureProvider}>{report.provider.name}</p>
          ) : null}
        </div>
        <p className={styles.generated}>
          Generado desde la plataforma HachiSky
        </p>
      </footer>
    </article>
  );
}
