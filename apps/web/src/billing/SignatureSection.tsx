import styles from "../users/admin.module.css";
import { ImageUploadForm } from "./ImageUploadForm.tsx";
import { StoredImagePreview } from "./StoredImagePreview.tsx";
import type { ImageVersionSummary } from "./signers.ts";

// The signer's current signature and the upload of a new version. Earlier
// versions are kept (documents issued later reference the exact version);
// nothing here deletes an image.
export function SignatureSection({
  signature,
  versionCount,
  uploadUrl,
}: {
  signature: ImageVersionSummary | null;
  versionCount: number;
  uploadUrl: string;
}) {
  const previous = Math.max(0, versionCount - 1);
  return (
    <section className={styles.card} aria-labelledby="signature-title">
      <h2 id="signature-title" className={styles.cardTitle}>
        Firma
      </h2>
      <p className={styles.cardHint}>
        Es una firma gráfica (una imagen de la firma), no es una firma digital
        certificada.
      </p>
      <StoredImagePreview
        image={signature}
        alt="Firma actual del firmante"
        emptyText="Este firmante todavía no tiene firma."
      />
      {previous > 0 ? (
        <p className={styles.muted}>
          Se conservan {previous}{" "}
          {previous === 1 ? "versión anterior" : "versiones anteriores"}.
        </p>
      ) : null}
      <ImageUploadForm
        uploadUrl={uploadUrl}
        purpose="signature"
        label="Imagen de la firma"
        submitLabel={signature ? "Subir nueva firma" : "Subir firma"}
      />
    </section>
  );
}
