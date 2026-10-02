import Link from "next/link";
import styles from "../users/admin.module.css";
import { StatusBadge } from "../users/Badges.tsx";
import { NEW_SIGNER_PATH, signerPath } from "./paths.ts";
import type { SignerRecord } from "./signers.ts";

function identification(signer: SignerRecord) {
  return `${signer.identificationType} ${signer.identificationNumber}`;
}

function SignatureBadge({ signer }: { signer: SignerRecord }) {
  return (
    <span
      className={`${styles.badge} ${signer.signature ? styles.badgeActive : styles.badgePending}`}
    >
      {signer.signature ? "Con firma" : "Sin firma"}
    </span>
  );
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay firmantes</h2>
      <p>
        Agrega el primero con “Nuevo firmante” y súbele su firma. Quien firma
        puede ser distinto de quien prepara el documento.
      </p>
      <Link
        href={NEW_SIGNER_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nuevo firmante
      </Link>
    </div>
  );
}

// No images here: the list only says whether each signer has a signature.
export function SignerList({ items }: { items: readonly SignerRecord[] }) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((signer) => (
          <li key={signer.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{signer.fullName}</strong>
              <span className={styles.muted}>
                {signer.jobTitle} · {identification(signer)}
              </span>
              <span className={styles.muted}>{signer.email}</span>
            </div>
            <div className={styles.badges}>
              <SignatureBadge signer={signer} />
              <StatusBadge active={signer.active} />
            </div>
            <Link
              href={signerPath(signer.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Ver el firmante ${signer.fullName}`}
            >
              Ver
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Cargo</th>
              <th scope="col">Identificación</th>
              <th scope="col">Correo</th>
              <th scope="col">Firma</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((signer) => (
              <tr
                key={signer.id}
                className={signer.active ? "" : styles.rowInactive}
              >
                <td>
                  <strong>{signer.fullName}</strong>
                </td>
                <td>{signer.jobTitle}</td>
                <td>{identification(signer)}</td>
                <td>{signer.email}</td>
                <td>
                  <SignatureBadge signer={signer} />
                </td>
                <td>
                  <StatusBadge active={signer.active} />
                </td>
                <td>
                  <Link
                    href={signerPath(signer.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Ver el firmante ${signer.fullName}`}
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
