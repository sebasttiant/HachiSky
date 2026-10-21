import Link from "next/link";
import styles from "../users/admin.module.css";
import {
  CLIENTS_PATH,
  type ClientListFilters,
  hasSearchFilters,
} from "./filters.ts";

// A plain GET form: it works without JavaScript and the URL stays shareable.
// Submitting drops `page` because the form does not send it.
export function ClientFiltersForm({ filters }: { filters: ClientListFilters }) {
  return (
    <form
      className={`${styles.card} ${styles.toolbar}`}
      method="get"
      action={CLIENTS_PATH}
      aria-label="Buscar clientes"
    >
      <div className={`${styles.field} ${styles.search}`}>
        <label htmlFor="filter-q">Buscar</label>
        <input
          id="filter-q"
          name="q"
          type="search"
          className={styles.input}
          defaultValue={filters.q ?? ""}
          placeholder="Nombre o número de identificación"
          maxLength={100}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="filter-status">Estado</label>
        <select
          id="filter-status"
          name="status"
          className={styles.select}
          defaultValue={filters.status}
        >
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>
      <div className={styles.toolbarActions}>
        <button type="submit" className={`${styles.button} ${styles.primary}`}>
          Buscar
        </button>
        {hasSearchFilters(filters) ? (
          <Link
            href={CLIENTS_PATH}
            className={`${styles.button} ${styles.secondary}`}
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
