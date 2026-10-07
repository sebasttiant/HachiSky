import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { NEW_SIGNER_PATH } from "../../../../src/billing/paths.ts";
import { SignerList } from "../../../../src/billing/SignerList.tsx";
import { listSigners } from "../../../../src/billing/signers.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Firmantes" };

export default async function SignersPage() {
  const { user } = await requireModule("settings", "/settings/signers");
  const items = await listSigners(
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
        title="Firmantes"
        description="Personas que firman las cuentas de cobro, con su cargo y su firma gráfica. El emisor se configura aparte, en Emisores.Los firmantes no se borran: se desactivan."
        actions={
          <Link
            href={NEW_SIGNER_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nuevo firmante
          </Link>
        }
      />
      <section aria-labelledby="signers-title" className={styles.stack}>
        <h2 id="signers-title" className="sr-only">
          Lista de firmantes
        </h2>
        <SignerList items={items} />
      </section>
    </div>
  );
}
