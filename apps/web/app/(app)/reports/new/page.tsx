import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { listClients } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { createReportAction } from "../../../../src/reports/actions.ts";
import { ReportForm } from "../../../../src/reports/ReportForm.tsx";
import {
  listProviderOptions,
  listSignerOptions,
} from "../../../../src/reports/service.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";
import { collectClientPages } from "../../../../src/work/client-options.ts";

export const metadata: Metadata = { title: "Nuevo informe" };

export default async function NewReportPage() {
  const { user } = await requireModule("reports", "/reports/new");
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  // Every active client, not just the first page.
  const deps = { db: getDb() };
  const items = await collectClientPages((page) =>
    listClients(deps, actor, { status: "active", page }),
  );
  const clients = items.map((client) => ({
    id: client.id,
    label: `${client.name} · ${client.identificationType} ${client.identificationNumber}`,
  }));
  const [providers, signers] = await Promise.all([
    listProviderOptions(deps, actor),
    listSignerOptions(deps, actor),
  ]);

  return (
    <div className="container">
      <Link href="/reports" className={styles.breadcrumb}>
        ← Informes
      </Link>
      <PageHeader
        moduleId="reports"
        title="Nuevo informe"
        description="Elige el tipo y el cliente. El informe se crea con sus secciones y después las vas llenando."
      />
      <section className={styles.card} aria-labelledby="form-title">
        <h2 id="form-title" className={styles.cardTitle}>
          Datos del informe
        </h2>
        <ReportForm
          action={createReportAction}
          clients={clients}
          providers={providers}
          signers={signers}
          submitLabel="Crear informe"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
