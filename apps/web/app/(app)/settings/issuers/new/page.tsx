import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createIssuerAction } from "../../../../../src/billing/actions.ts";
import { IssuerForm } from "../../../../../src/billing/IssuerForm.tsx";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nuevo emisor" };

export default async function NewIssuerPage() {
  await requireModule("settings", "/settings/issuers/new");
  return (
    <div className="container">
      <Link href="/settings/issuers" className={styles.breadcrumb}>
        ← Emisores
      </Link>
      <PageHeader
        moduleId="settings"
        title="Nuevo emisor"
        description="Escribe los datos del emisor. Después de crearlo podrás subir su logo. Si todavía no hay un emisor predeterminado, este quedará como predeterminado."
      />
      <section className={styles.card} aria-labelledby="new-issuer-title">
        <h2 id="new-issuer-title" className="sr-only">
          Datos del emisor
        </h2>
        <IssuerForm
          action={createIssuerAction}
          submitLabel="Crear emisor"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
