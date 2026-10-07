import Link from "next/link";
import { formatDateTime } from "../shared/format/date.ts";
import styles from "./admin.module.css";
import {
  PendingPasswordBadge,
  RoleBadge,
  StatusBadge,
  UserAvatar,
} from "./Badges.tsx";
import {
  hasSearchFilters,
  USERS_PATH,
  type UserListFilters,
  usersHref,
} from "./filters.ts";
import type { UserRow } from "./service.ts";

function detailHref(id: string) {
  return `${USERS_PATH}/${encodeURIComponent(id)}`;
}

function lastSeen(user: UserRow) {
  return user.lastSeenAt ? formatDateTime(user.lastSeenAt) : "Nunca";
}

// Says the true reason the list is empty: no match is not "no users".
function EmptyList({ filters }: { filters: UserListFilters }) {
  return hasSearchFilters(filters) ? (
    <div className={styles.empty}>
      <h2>Sin coincidencias</h2>
      <p>Ningún usuario coincide con la búsqueda o los filtros.</p>
      <Link
        href={USERS_PATH}
        className={`${styles.button} ${styles.secondary}`}
      >
        Ver todos los usuarios
      </Link>
    </div>
  ) : (
    <div className={styles.empty}>
      <h2>Todavía no hay usuarios</h2>
      <p>Crea la primera cuenta del equipo con “Crear usuario”.</p>
    </div>
  );
}

export function UserList({
  items,
  hasMore,
  filters,
  currentUserId,
}: {
  items: readonly UserRow[];
  hasMore: boolean;
  filters: UserListFilters;
  currentUserId: string;
}) {
  if (items.length === 0) return <EmptyList filters={filters} />;

  const badges = (user: UserRow) => (
    <div className={styles.badges}>
      <RoleBadge role={user.role} />
      <StatusBadge active={user.active} />
      {user.mustChangePassword ? <PendingPasswordBadge /> : null}
    </div>
  );
  const name = (user: UserRow) =>
    user.id === currentUserId ? `${user.name} (tú)` : user.name;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((user) => (
          <li key={user.id} className={styles.userCard}>
            <div className={styles.userHead}>
              <UserAvatar name={user.name} active={user.active} />
              <div className={styles.identity}>
                <strong>{name(user)}</strong>
                <span className={styles.muted}>{user.email}</span>
                {user.jobTitle ? (
                  <span className={styles.muted}>{user.jobTitle}</span>
                ) : null}
              </div>
            </div>
            {badges(user)}
            <span className={styles.muted}>
              Última actividad: {lastSeen(user)}
            </span>
            <Link
              href={detailHref(user.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Gestionar a ${user.name}`}
            >
              Gestionar
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Cargo</th>
              <th scope="col">Acceso</th>
              <th scope="col">Última actividad</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((user) => (
              <tr
                key={user.id}
                className={user.active ? "" : styles.rowInactive}
              >
                <td>
                  <div className={styles.userHead}>
                    <UserAvatar name={user.name} active={user.active} />
                    <div className={styles.identity}>
                      <strong>{name(user)}</strong>
                      <span className={styles.muted}>{user.email}</span>
                    </div>
                  </div>
                </td>
                <td>{user.jobTitle ?? "—"}</td>
                <td>{badges(user)}</td>
                <td>{lastSeen(user)}</td>
                <td>
                  <Link
                    href={detailHref(user.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Gestionar a ${user.name}`}
                  >
                    Gestionar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filters.page > 1 || hasMore ? (
        <nav className={styles.pager} aria-label="Páginas de usuarios">
          {filters.page > 1 ? (
            <Link
              href={usersHref(filters, { page: filters.page - 1 })}
              className={`${styles.button} ${styles.secondary}`}
            >
              ← Anteriores
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={usersHref(filters, { page: filters.page + 1 })}
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
