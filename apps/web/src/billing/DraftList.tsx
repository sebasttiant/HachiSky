import Link from "next/link";
import { formatDateTime } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";
import type { DraftSummary } from "./drafts.ts";
import { formatAmount } from "./money.ts";
import { draftPath, NEW_DRAFT_PATH } from "./paths.ts";

function lineCount(count: number) {
  return count === 1 ? "1 línea" : `${count} líneas`;
}

function DraftBadge() {
  return (
    <span className={`${styles.badge} ${styles.badgePending}`}>Borrador</span>
  );
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay cuentas de cobro</h2>
      <p>
        Empieza un borrador con “Nueva cuenta de cobro”. Recibe su número cuando
        se emite, no antes.
      </p>
      <Link
        href={NEW_DRAFT_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nueva cuenta de cobro
      </Link>
    </div>
  );
}

// Drafts have no number yet; they are told apart by client, issuer and total.
export function DraftList({ items }: { items: readonly DraftSummary[] }) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((draft) => (
          <li key={draft.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{draft.clientName}</strong>
              <span className={styles.muted}>
                {draft.issuerName} · {lineCount(draft.lineCount)}
              </span>
              <span>{formatAmount(draft.totalMinor, draft.currency)}</span>
            </div>
            <div className={styles.badges}>
              <DraftBadge />
            </div>
            <Link
              href={draftPath(draft.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Abrir el borrador de ${draft.clientName}`}
            >
              Abrir
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Emisor</th>
              <th scope="col">Líneas</th>
              <th scope="col">Total</th>
              <th scope="col">Estado</th>
              <th scope="col">Última modificación</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((draft) => (
              <tr key={draft.id}>
                <td>
                  <strong>{draft.clientName}</strong>
                </td>
                <td>{draft.issuerName}</td>
                <td>{lineCount(draft.lineCount)}</td>
                <td>{formatAmount(draft.totalMinor, draft.currency)}</td>
                <td>
                  <DraftBadge />
                </td>
                <td>{formatDateTime(draft.updatedAt)}</td>
                <td>
                  <Link
                    href={draftPath(draft.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Abrir el borrador de ${draft.clientName}`}
                  >
                    Abrir
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
