import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { IssuerList } from "../../../../src/billing/IssuerList.tsx";
import { listIssuers } from "../../../../src/billing/issuers.ts";
import { NEW_ISSUER_PATH } from "../../../../src/billing/paths.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Emisores" };

export default async function IssuersPage() {
  const { user } = await requireModule("settings", "/settings/issuers");
  const items = await listIssuers(
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
        title="Emisores"
        description="Quién emite las cuentas de cobro: nombre, identificación, contacto, logo y condiciones de pago por defecto. El predeterminado se propone en cada documento nuevo. Los emisores no se borran: se desactivan."
        actions={
          <Link
            href={NEW_ISSUER_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nuevo emisor
          </Link>
        }
      />
      <section aria-labelledby="issuers-title" className={styles.stack}>
        <h2 id="issuers-title" className="sr-only">
          Lista de emisores
        </h2>
        <IssuerList items={items} />
      </section>
    </div>
  );
}
