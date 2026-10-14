import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../src/auth/guard.ts";
import { listClients } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { ActivityPicker } from "../../../../src/reports/ActivityPicker.tsx";
import {
  deleteReportAction,
  replaceItemsAction,
  setActivitiesAction,
  updateReportAction,
  updateSectionAction,
} from "../../../../src/reports/actions.ts";
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
            />
          ))}
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
    </div>
  );
}
