import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { listClients } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";
import { ActivityForm } from "../../../../src/work/ActivityForm.tsx";
import { createActivityAction } from "../../../../src/work/actions.ts";
import { collectClientPages } from "../../../../src/work/client-options.ts";

export const metadata: Metadata = { title: "Nueva actividad" };

export default async function NewActivityPage() {
  const { user } = await requireModule("work", "/work/new");
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  // Offer active clients from every catalogue page, not just the first 25.
  const deps = { db: getDb() };
  const items = await collectClientPages((page) =>
    listClients(deps, actor, { status: "active", page }),
  );
  const clients = items.map((client) => ({
    id: client.id,
    label: `${client.name} · ${client.identificationType} ${client.identificationNumber}`,
  }));

  return (
    <div className="container">
      <Link href="/work" className={styles.breadcrumb}>
        ← Trabajo
      </Link>
      <PageHeader
        moduleId="work"
        title="Nueva actividad"
        description="Registra lo que hiciste para un cliente, el resultado y los pendientes. El horario es opcional."
      />
      <section className={styles.card} aria-labelledby="form-title">
        <h2 id="form-title" className={styles.cardTitle}>
          Datos de la actividad
        </h2>
        {clients.length === 0 ? (
          <p className={`${styles.alert} ${styles.alertInfo}`}>
            Todavía no hay clientes activos. Crea uno en Clientes antes de
            registrar trabajo.
          </p>
        ) : (
          <ActivityForm
            action={createActivityAction}
            clients={clients}
            submitLabel="Guardar actividad"
            pendingLabel="Guardando…"
          />
        )}
      </section>
    </div>
  );
}
