import Link from "next/link";
import styles from "../users/admin.module.css";
import { StatusBadge } from "../users/Badges.tsx";
import type { IssuerRecord } from "./issuers.ts";
import { issuerPath, NEW_ISSUER_PATH } from "./paths.ts";

function identification(issuer: IssuerRecord) {
  return `${issuer.identificationType} ${issuer.identificationNumber}`;
}

function DefaultBadge({ issuer }: { issuer: IssuerRecord }) {
  return issuer.isDefault ? (
    <span className={`${styles.badge} ${styles.badgeAdmin}`}>
      Predeterminado
    </span>
  ) : null;
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Aún no hay emisores</h2>
      <p>
        Agrega el primero con “Nuevo emisor”. Será el emisor predeterminado de
        las cuentas de cobro y después podrás subir su logo.
      </p>
      <Link
        href={NEW_ISSUER_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nuevo emisor
      </Link>
    </div>
  );
}

// No logos here: the list only identifies each issuer and its status.
export function IssuerList({ items }: { items: readonly IssuerRecord[] }) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((issuer) => (
          <li key={issuer.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{issuer.legalName}</strong>
              <span className={styles.muted}>{identification(issuer)}</span>
              <span className={styles.muted}>{issuer.city}</span>
            </div>
            <div className={styles.badges}>
              <DefaultBadge issuer={issuer} />
              <StatusBadge active={issuer.active} />
            </div>
            <Link
              href={issuerPath(issuer.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Ver el emisor ${issuer.legalName}`}
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
              <th scope="col">Nombre o razón social</th>
              <th scope="col">Identificación</th>
              <th scope="col">Ciudad</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((issuer) => (
              <tr
                key={issuer.id}
                className={issuer.active ? "" : styles.rowInactive}
              >
                <td>
                  <strong>{issuer.legalName}</strong>
                </td>
                <td>{identification(issuer)}</td>
                <td>{issuer.city}</td>
                <td>
                  <span className={styles.badges}>
                    <DefaultBadge issuer={issuer} />
                    <StatusBadge active={issuer.active} />
                  </span>
                </td>
                <td>
                  <Link
                    href={issuerPath(issuer.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Ver el emisor ${issuer.legalName}`}
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
