import Link from "next/link";
import styles from "./admin.module.css";
import {
  hasSearchFilters,
  USERS_PATH,
  type UserListFilters,
} from "./filters.ts";
import { ROLE_LABEL } from "./presentation.ts";

// A plain GET form: it works without JavaScript and the URL stays shareable.
// Submitting drops `page` because the form does not send it.
export function UserFiltersForm({ filters }: { filters: UserListFilters }) {
  return (
    <form
      className={`${styles.card} ${styles.toolbar}`}
      method="get"
      action={USERS_PATH}
      aria-label="Buscar usuarios"
    >
      <div className={`${styles.field} ${styles.search}`}>
        <label htmlFor="filter-q">Buscar</label>
        <input
          id="filter-q"
          name="q"
          type="search"
          className={styles.input}
          defaultValue={filters.q ?? ""}
          placeholder="Nombre o correo"
          maxLength={100}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="filter-role">Rol</label>
        <select
          id="filter-role"
          name="role"
          className={styles.select}
          defaultValue={filters.role ?? ""}
        >
          <option value="">Todos</option>
          <option value="admin">{ROLE_LABEL.admin}</option>
          <option value="staff">{ROLE_LABEL.staff}</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="filter-status">Estado</label>
        <select
          id="filter-status"
          name="status"
          className={styles.select}
          defaultValue={filters.status ?? ""}
        >
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>
      <div className={styles.toolbarActions}>
        <button type="submit" className={`${styles.button} ${styles.primary}`}>
          Buscar
        </button>
        {hasSearchFilters(filters) ? (
          <Link
            href={USERS_PATH}
            className={`${styles.button} ${styles.secondary}`}
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
