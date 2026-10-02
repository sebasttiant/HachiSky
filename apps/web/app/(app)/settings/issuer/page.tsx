import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { saveIssuerAction } from "../../../../src/billing/actions.ts";
import { IssuerForm } from "../../../../src/billing/IssuerForm.tsx";
import { IssuerNotice } from "../../../../src/billing/IssuerNotice.tsx";
import { getIssuerSettings } from "../../../../src/billing/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Datos del emisor" };

export default async function IssuerSettingsPage() {
  const { user } = await requireModule("settings", "/settings/issuer");
  const issuer = await getIssuerSettings(
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
        title="Datos del emisor"
        description="Nombre, identificación y contacto de IL Asesorías en las cuentas de cobro, y las condiciones de pago por defecto."
      />
      <div className={styles.stack}>
        <IssuerNotice issuer={issuer} />
        <section className={styles.card} aria-labelledby="issuer-title">
          <h2 id="issuer-title" className="sr-only">
            Datos del emisor
          </h2>
          <IssuerForm action={saveIssuerAction} values={issuer ?? undefined} />
        </section>
      </div>
    </div>
  );
}
