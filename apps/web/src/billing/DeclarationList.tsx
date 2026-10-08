import Link from "next/link";
import styles from "../users/admin.module.css";
import { StatusBadge } from "../users/Badges.tsx";
import type { DeclarationRecord } from "./declarations.ts";
import { declarationPath, NEW_DECLARATION_PATH } from "./paths.ts";

const PREVIEW_LENGTH = 120;

// First line of the text, cut short, so long declarations keep the list
// readable. The full text is on the declaration's page.
function preview(body: string) {
  const firstLine = body.split("\n", 1)[0] ?? "";
  return firstLine.length > PREVIEW_LENGTH
    ? `${firstLine.slice(0, PREVIEW_LENGTH)}…`
    : firstLine;
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay declaraciones</h2>
      <p>
        Agrega los textos de declaración que uses en las cuentas de cobro;
        ninguna viene incluida.
      </p>
      <Link
        href={NEW_DECLARATION_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nueva declaración
      </Link>
    </div>
  );
}

export function DeclarationList({
  items,
}: {
  items: readonly DeclarationRecord[];
}) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((declaration) => (
          <li key={declaration.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{declaration.label}</strong>
              <span className={styles.muted}>{preview(declaration.body)}</span>
            </div>
            <div className={styles.badges}>
              <StatusBadge active={declaration.active} />
            </div>
            <Link
              href={declarationPath(declaration.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Ver la declaración ${declaration.label}`}
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
              <th scope="col">Texto</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((declaration) => (
              <tr
                key={declaration.id}
                className={declaration.active ? "" : styles.rowInactive}
              >
                <td>
                  <strong>{declaration.label}</strong>
                </td>
                <td>{preview(declaration.body)}</td>
                <td>
                  <StatusBadge active={declaration.active} />
                </td>
                <td>
                  <Link
                    href={declarationPath(declaration.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Ver la declaración ${declaration.label}`}
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
