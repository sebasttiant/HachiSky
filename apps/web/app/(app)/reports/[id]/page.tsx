import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../src/auth/guard.ts";
import { listClients } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { ActivityPicker } from "../../../../src/reports/ActivityPicker.tsx";
import {
  deleteReportAction,
  issueReportAction,
  moveImageAction,
  refreshReportAction,
  removeImageAction,
  replaceItemsAction,
  setActivitiesAction,
  updateImageTextAction,
  updateReportAction,
  updateSectionAction,
} from "../../../../src/reports/actions.ts";
import {
  listImages,
  type ReportImageRecord,
} from "../../../../src/reports/images.ts";
import { reportPath } from "../../../../src/reports/paths.ts";
import { ReportForm } from "../../../../src/reports/ReportForm.tsx";
import { SectionEditor } from "../../../../src/reports/SectionEditor.tsx";
import {
  getReport,
  selectableActivities,
} from "../../../../src/reports/service.ts";
import {
  REPORT_TYPE_LABEL,
  templateFor,
} from "../../../../src/reports/templates.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";
import { ConfirmAction } from "../../../../src/users/ConfirmAction.tsx";
import { collectClientPages } from "../../../../src/work/client-options.ts";

export const metadata: Metadata = { title: "Informe" };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireModule("reports", `/reports/${id}`);
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const deps = { db: getDb() };

  // Null covers both "no such report" and "written by somebody else", on
  // purpose: a colleague is never told which ids exist.
  const report = await getReport(deps, actor, id);
  if (!report) notFound();

  const items = await collectClientPages((page) =>
    listClients(deps, actor, { status: "active", page }),
  );
  const clients = items.map((client) => ({
    id: client.id,
    label: `${client.name} · ${client.identificationType} ${client.identificationNumber}`,
  }));
  if (!clients.some((option) => option.id === report.clientId)) {
    clients.unshift({ id: report.clientId, label: report.clientName });
  }

  // Only activities this author could open themselves.
  const available = await selectableActivities(deps, actor, report.clientId);
  const selected = report.activities.map((activity) => activity.id);
  const hints = new Map(
    templateFor(report.type).map((section) => [section.key, section.hint]),
  );

  // Figures hang off their section, so they are handed to the editor of the
  // section they belong to and nowhere else.
  const bySection = new Map<string, ReportImageRecord[]>();
  for (const image of await listImages(deps, actor, report.id)) {
    const current = bySection.get(image.sectionKey);
    if (current) current.push(image);
    else bySection.set(image.sectionKey, [image]);
  }

  return (
    <div className="container">
      <Link href="/reports" className={styles.breadcrumb}>
        ← Informes
      </Link>
      <PageHeader
        moduleId="reports"
        title={report.title}
        description={`${REPORT_TYPE_LABEL[report.type]} · ${report.clientName}`}
        actions={
          <Link
            href={`${reportPath(report.id)}/documento`}
            className={`${styles.button} ${styles.secondary}`}
          >
            Ver documento
          </Link>
        }
      />
      {report.status === "issued" ? (
        <section className={styles.card} aria-labelledby="issued-title">
          <h2 id="issued-title" className={styles.cardTitle}>
            Informe emitido
          </h2>
          <p className={styles.cardHint}>
            Este informe ya salió
            {report.issuedAt
              ? ` el ${report.issuedAt.toLocaleDateString("es-CO")}`
              : ""}
            . Su contenido quedó guardado tal como se envió y ya no se puede
            editar ni eliminar. Para corregirlo, crea un informe nuevo.
          </p>
          <Link
            href={`${reportPath(report.id)}/documento`}
            className={`${styles.button} ${styles.primary}`}
          >
            Ver el documento emitido
          </Link>
        </section>
      ) : (
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos del informe
            </h2>
            <ReportForm
              action={updateReportAction.bind(null, report.id)}
              clients={clients}
              values={report}
              lockType
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>

          <section className={styles.card} aria-labelledby="activities-title">
            <h2 id="activities-title" className={styles.cardTitle}>
              Actividades que describe
            </h2>
            <ActivityPicker
              available={available}
              selected={selected}
              action={setActivitiesAction.bind(null, report.id)}
            />
          </section>

          <section aria-labelledby="sections-title" className={styles.stack}>
            <h2 id="sections-title" className={styles.cardTitle}>
              Contenido
            </h2>
            {report.sections.map((section) => (
              <SectionEditor
                key={section.key}
                section={section}
                hint={hints.get(section.key) ?? ""}
                saveSection={updateSectionAction.bind(null, report.id)}
                saveItems={replaceItemsAction.bind(null, report.id)}
                reportId={report.id}
                images={bySection.get(section.key) ?? []}
                updateImageText={updateImageTextAction.bind(null, report.id)}
                removeImage={removeImageAction.bind(null, report.id)}
                moveImage={moveImageAction.bind(null, report.id)}
                refreshImages={refreshReportAction.bind(null, report.id)}
              />
            ))}
          </section>

          <section className={styles.card} aria-labelledby="issue-title">
            <h2 id="issue-title" className={styles.cardTitle}>
              Emitir informe
            </h2>
            <p className={styles.cardHint}>
              Al emitirlo, el contenido queda guardado tal como está hoy — con
              las actividades y la firma de hoy — y ya no se podrá editar ni
              eliminar.
            </p>
            <ConfirmAction
              action={issueReportAction.bind(null, report.id)}
              label="Emitir informe"
              confirmLabel="Sí, emitir"
              warning="El informe se emitirá con su contenido actual. Esta acción no se puede deshacer."
              tone="primary"
            />
          </section>

          <section className={styles.card} aria-labelledby="delete-title">
            <h2 id="delete-title" className={styles.cardTitle}>
              Eliminar informe
            </h2>
            <p className={styles.cardHint}>
              Se borra el informe y todo lo escrito en él. Las actividades
              registradas en Trabajo no se tocan. No se puede deshacer.
            </p>
            <ConfirmAction
              action={deleteReportAction.bind(null, report.id)}
              label="Eliminar informe"
              confirmLabel="Sí, eliminar"
              warning={`"${report.title}" se eliminará definitivamente.`}
            />
          </section>
        </div>
      )}
    </div>
  );
}
