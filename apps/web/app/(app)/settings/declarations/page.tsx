import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { DeclarationList } from "../../../../src/billing/DeclarationList.tsx";
import { listDeclarations } from "../../../../src/billing/declarations.ts";
import { NEW_DECLARATION_PATH } from "../../../../src/billing/paths.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Declaraciones" };

export default async function DeclarationsPage() {
  const { user } = await requireModule("settings", "/settings/declarations");
  const items = await listDeclarations(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );

  return (
    <div className="container">
      <Link href="/settings" className={styles.breadcrumb}>
        ← Configuración
      </Link>
      <PageHeader
        moduleId="settings"
        title="Declaraciones"
        description="Textos de declaración tributaria que se pueden incluir en una cuenta de cobro. Ninguno viene incluido ni se agrega solo. Las declaraciones no se borran: se desactivan."
        actions={
          <Link
            href={NEW_DECLARATION_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nueva declaración
          </Link>
        }
      />
      <section aria-labelledby="declarations-title" className={styles.stack}>
        <h2 id="declarations-title" className="sr-only">
          Lista de declaraciones
        </h2>
        <DeclarationList items={items} />
      </section>
    </div>
  );
}
