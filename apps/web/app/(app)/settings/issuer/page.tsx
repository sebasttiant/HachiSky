import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { saveIssuerAction } from "../../../../src/billing/actions.ts";
import { ImageUploadForm } from "../../../../src/billing/ImageUploadForm.tsx";
import { IssuerForm } from "../../../../src/billing/IssuerForm.tsx";
import { IssuerNotice } from "../../../../src/billing/IssuerNotice.tsx";
import { ISSUER_LOGO_UPLOAD_PATH } from "../../../../src/billing/paths.ts";
import { StoredImagePreview } from "../../../../src/billing/StoredImagePreview.tsx";
import { getIssuerSettings } from "../../../../src/billing/service.ts";
import { getIssuerLogo } from "../../../../src/billing/signers.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Datos del emisor" };

export default async function IssuerSettingsPage() {
  const { user } = await requireModule("settings", "/settings/issuer");
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const issuer = await getIssuerSettings(deps, actor);
  const logo = issuer ? await getIssuerLogo(deps, actor) : null;

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
        <section className={styles.card} aria-labelledby="logo-title">
          <h2 id="logo-title" className={styles.cardTitle}>
            Logo
          </h2>
          {issuer ? (
            <>
              <StoredImagePreview
                image={logo}
                alt="Logo actual del emisor"
                emptyText="Todavía no hay logo. Las cuentas de cobro se verán sin él."
              />
              <ImageUploadForm
                uploadUrl={ISSUER_LOGO_UPLOAD_PATH}
                purpose="issuer_logo"
                label="Imagen del logo"
                submitLabel={logo ? "Subir nuevo logo" : "Subir logo"}
              />
            </>
          ) : (
            <p className={styles.cardHint}>
              Guarda primero los datos del emisor; después podrás subir el logo.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
