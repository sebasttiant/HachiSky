import Link from "next/link";
import styles from "../users/admin.module.css";
import { StatusBadge } from "../users/Badges.tsx";
import {
  CLIENTS_PATH,
  type ClientListFilters,
  clientsHref,
  hasSearchFilters,
} from "./filters.ts";
import type { ClientRecord } from "./service.ts";

export const NEW_CLIENT_PATH = `${CLIENTS_PATH}/new`;

function detailHref(id: string) {
  return `${CLIENTS_PATH}/${encodeURIComponent(id)}`;
}

function identification(client: ClientRecord) {
  return `${client.identificationType} ${client.identificationNumber}`;
}

function contact(client: ClientRecord) {
  return [client.email, client.phone].filter(Boolean).join(" · ") || "—";
}

// Says the true reason the list is empty: no match is not "no clients".
function EmptyList({ filters }: { filters: ClientListFilters }) {
  return hasSearchFilters(filters) ? (
    <div className={styles.empty}>
      <h2>Sin coincidencias</h2>
      <p>Ningún cliente coincide con la búsqueda o el estado elegido.</p>
      <Link
        href={CLIENTS_PATH}
        className={`${styles.button} ${styles.secondary}`}
      >
        Ver clientes activos
      </Link>
    </div>
  ) : (
    <div className={styles.empty}>
      <h2>Todavía no hay clientes</h2>
      <p>Crea el primero con “Nuevo cliente”.</p>
      <Link
        href={NEW_CLIENT_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nuevo cliente
      </Link>
    </div>
  );
}

export function ClientList({
  items,
  hasMore,
  filters,
}: {
  items: readonly ClientRecord[];
  hasMore: boolean;
  filters: ClientListFilters;
}) {
  if (items.length === 0) return <EmptyList filters={filters} />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((client) => (
          <li key={client.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{client.name}</strong>
              <span className={styles.muted}>{identification(client)}</span>
              {client.city ? (
                <span className={styles.muted}>{client.city}</span>
              ) : null}
              <span className={styles.muted}>{contact(client)}</span>
            </div>
            <div className={styles.badges}>
              <StatusBadge active={client.active} />
            </div>
            <Link
              href={detailHref(client.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Ver a ${client.name}`}
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
              <th scope="col">Cliente</th>
              <th scope="col">Identificación</th>
              <th scope="col">Ciudad</th>
              <th scope="col">Contacto</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((client) => (
              <tr
                key={client.id}
                className={client.active ? "" : styles.rowInactive}
              >
                <td>
                  <strong>{client.name}</strong>
                </td>
                <td>{identification(client)}</td>
                <td>{client.city ?? "—"}</td>
                <td>{contact(client)}</td>
                <td>
                  <StatusBadge active={client.active} />
                </td>
                <td>
                  <Link
                    href={detailHref(client.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Ver a ${client.name}`}
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filters.page > 1 || hasMore ? (
        <nav className={styles.pager} aria-label="Páginas de clientes">
          {filters.page > 1 ? (
            <Link
              href={clientsHref(filters, { page: filters.page - 1 })}
              className={`${styles.button} ${styles.secondary}`}
            >
              ← Anteriores
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={clientsHref(filters, { page: filters.page + 1 })}
              className={`${styles.button} ${styles.secondary}`}
            >
              Siguientes →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
