import { formatDateTime } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";
import { billingImagePath } from "./paths.ts";
import type { ImageVersionSummary } from "./signers.ts";

function kilobytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Shows one stored version through the protected image route (admins only,
// never a data URL or a public file).
export function StoredImagePreview({
  image,
  alt,
  emptyText,
}: {
  image: ImageVersionSummary | null;
  alt: string;
  emptyText: string;
}) {
  if (!image) return <p className={styles.muted}>{emptyText}</p>;
  return (
    <figure className={styles.stack}>
      {/* biome-ignore lint/performance/noImgElement: private, per-version image served by an authenticated route; next/image would proxy it through the public optimizer */}
      <img
        src={billingImagePath(image.id)}
        alt={alt}
        width={image.width}
        height={image.height}
        className={styles.imagePreview}
      />
      <figcaption className={styles.muted}>
        {image.width} × {image.height} px · {kilobytes(image.byteSize)} · subida
        el {formatDateTime(image.createdAt)}
      </figcaption>
    </figure>
  );
}
