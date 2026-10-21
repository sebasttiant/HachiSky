import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createSignerAction } from "../../../../../src/billing/actions.ts";
import { SignerForm } from "../../../../../src/billing/SignerForm.tsx";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nuevo firmante" };

export default async function NewSignerPage() {
  await requireModule("settings", "/settings/signers/new");
  return (
    <div className="container">
      <Link href="/settings/signers" className={styles.breadcrumb}>
        ← Firmantes
      </Link>
      <PageHeader
        moduleId="settings"
        title="Nuevo firmante"
        description="Escribe los datos de quien firma. Después de crearlo podrás subir su firma."
      />
      <section className={styles.card} aria-labelledby="new-signer-title">
        <h2 id="new-signer-title" className="sr-only">
          Datos del firmante
        </h2>
        <SignerForm
          action={createSignerAction}
          submitLabel="Crear firmante"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
