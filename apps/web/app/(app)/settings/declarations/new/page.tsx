import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createDeclarationAction } from "../../../../../src/billing/actions.ts";
import { DeclarationForm } from "../../../../../src/billing/DeclarationForm.tsx";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nueva declaración" };

export default async function NewDeclarationPage() {
  await requireModule("settings", "/settings/declarations/new");
  return (
    <div className="container">
      <Link href="/settings/declarations" className={styles.breadcrumb}>
        ← Declaraciones
      </Link>
      <PageHeader
        moduleId="settings"
        title="Nueva declaración"
        description="Dale un nombre corto para reconocerla y escribe el texto que se imprimirá."
      />
      <section className={styles.card} aria-labelledby="new-declaration-title">
        <h2 id="new-declaration-title" className="sr-only">
          Datos de la declaración
        </h2>
        <DeclarationForm
          action={createDeclarationAction}
          submitLabel="Crear declaración"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
