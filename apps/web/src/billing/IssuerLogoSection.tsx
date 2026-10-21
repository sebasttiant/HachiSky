import styles from "../users/admin.module.css";
import { ImageUploadForm } from "./ImageUploadForm.tsx";
import { StoredImagePreview } from "./StoredImagePreview.tsx";
import type { ImageVersionSummary } from "./signers.ts";

// One issuer's current logo and the upload of a new version. Earlier
// versions are kept (documents issued later reference the exact version);
// nothing here deletes an image. Only an active issuer receives a new logo.
export function IssuerLogoSection({
  logo,
  versionCount,
  active,
  uploadUrl,
}: {
  logo: ImageVersionSummary | null;
  versionCount: number;
  active: boolean;
  uploadUrl: string;
}) {
  const previous = Math.max(0, versionCount - 1);
  return (
    <section className={styles.card} aria-labelledby="logo-title">
      <h2 id="logo-title" className={styles.cardTitle}>
        Logo
      </h2>
      <StoredImagePreview
        image={logo}
        alt="Logo actual del emisor"
        emptyText="Este emisor todavía no tiene logo. Sus cuentas de cobro se verán sin él."
      />
      {previous > 0 ? (
        <p className={styles.muted}>
          Se conservan {previous}{" "}
          {previous === 1 ? "versión anterior" : "versiones anteriores"}.
        </p>
      ) : null}
      {active ? (
        <ImageUploadForm
          uploadUrl={uploadUrl}
          purpose="issuer_logo"
          label="Imagen del logo"
          submitLabel={logo ? "Subir nuevo logo" : "Subir logo"}
        />
      ) : (
        <p className={styles.cardHint}>
          Reactiva el emisor para subir un logo nuevo.
        </p>
      )}
    </section>
  );
}
