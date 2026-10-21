import Link from "next/link";
import { formatDate } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";
import type { IssuedSummary } from "./issuance.ts";
import { formatAmount } from "./money.ts";
import { draftDocumentPath } from "./paths.ts";

// The issued cuentas: each one with the consecutive it took and the day it
// went out. They open at the document, not at an editor — an issued cuenta
// is not edited.
export function IssuedList({ items }: { items: readonly IssuedSummary[] }) {
  return (
    <ul className={styles.cards}>
      {items.map((item) => (
        <li key={item.id} className={styles.userCard}>
          <div className={styles.identity}>
            <strong>
              {item.number} · {item.clientName}
            </strong>
            <span className={styles.muted}>
              Emitida el {formatDate(item.issuedAt.toISOString().slice(0, 10))}{" "}
              · {item.issuerName}
            </span>
            <span>{formatAmount(item.totalMinor, item.currency)}</span>
          </div>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${styles.badgeActive}`}>
              Emitida
            </span>
          </div>
          <Link
            href={draftDocumentPath(item.id)}
            className={`${styles.button} ${styles.secondary}`}
            aria-label={`Ver la cuenta ${item.number} de ${item.clientName}`}
          >
            Ver documento
          </Link>
        </li>
      ))}
    </ul>
  );
}
