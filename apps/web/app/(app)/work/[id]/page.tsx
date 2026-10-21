import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../src/auth/guard.ts";
import { listClients } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { formatDateTime } from "../../../../src/shared/format/date.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";
import { ConfirmAction } from "../../../../src/users/ConfirmAction.tsx";
import { ActivityForm } from "../../../../src/work/ActivityForm.tsx";
import {
  deleteActivityAction,
  updateActivityAction,
} from "../../../../src/work/actions.ts";
import { collectClientPages } from "../../../../src/work/client-options.ts";
import { getActivity } from "../../../../src/work/service.ts";

export const metadata: Metadata = { title: "Actividad" };

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireModule("work", `/work/${id}`);
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const deps = { db: getDb() };

  // Null covers both "no such activity" and "recorded by somebody else", on
  // purpose: a colleague is never told which ids exist.
  const activity = await getActivity(deps, actor, id);
  if (!activity) notFound();

  const items = await collectClientPages((page) =>
    listClients(deps, actor, { status: "active", page }),
  );
  const clients = items.map((client) => ({
    id: client.id,
    label: `${client.name} · ${client.identificationType} ${client.identificationNumber}`,
  }));
  // The activity's own client stays selectable even if it was deactivated
  // later, so editing the description does not force a client change.
  if (!clients.some((option) => option.id === activity.clientId)) {
    clients.unshift({ id: activity.clientId, label: activity.clientName });
  }

  return (
    <div className="container">
      <Link href="/work" className={styles.breadcrumb}>
        ← Trabajo
      </Link>
      <PageHeader
        moduleId="work"
        title={activity.title}
        description={`${activity.clientName} · registrada el ${formatDateTime(activity.createdAt)}`}
      />
      <div className={styles.stack}>
        <section className={styles.card} aria-labelledby="form-title">
          <h2 id="form-title" className={styles.cardTitle}>
            Datos de la actividad
          </h2>
          <ActivityForm
            action={updateActivityAction.bind(null, activity.id)}
            clients={clients}
            values={activity}
            submitLabel="Guardar cambios"
            pendingLabel="Guardando…"
          />
        </section>
        <section className={styles.card} aria-labelledby="delete-title">
          <h2 id="delete-title" className={styles.cardTitle}>
            Eliminar actividad
          </h2>
          <p className={styles.cardHint}>
            Se borra el registro de la actividad. No se puede deshacer.
          </p>
          <ConfirmAction
            action={deleteActivityAction.bind(null, activity.id)}
            label="Eliminar actividad"
            confirmLabel="Sí, eliminar"
            warning={`"${activity.title}" se eliminará definitivamente.`}
          />
        </section>
      </div>
    </div>
  );
}
