import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import { ActivityList } from "../../../../src/users/ActivityList.tsx";
import styles from "../../../../src/users/admin.module.css";
import { ACTION_LABEL } from "../../../../src/users/presentation.ts";
import { listAudit } from "../../../../src/users/service.ts";

export const metadata: Metadata = { title: "Actividad" };

const PATH = "/settings/activity";

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function href(action: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (action) params.set("accion", action);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("settings", "/settings/activity");
  const params = await searchParams;
  const requested = single(params.accion);
  const action =
    requested && Object.hasOwn(ACTION_LABEL, requested) ? requested : undefined;
  const pageParam = single(params.page);
  const page =
    pageParam && /^\d{1,4}$/.test(pageParam)
      ? Math.max(1, Number(pageParam))
      : 1;
  const { items, hasMore } = await listAudit({ db: getDb() }, { action, page });

  return (
    <div className="container">
      <Link href="/settings" className={styles.breadcrumb}>
        ← Configuración
      </Link>
      <PageHeader
        moduleId="settings"
        title="Actividad"
        description="Registro de las acciones de administración, de la más reciente a la más antigua. No se puede editar ni borrar."
      />
      <div className={styles.stack}>
        <form
          className={`${styles.card} ${styles.toolbar}`}
          method="get"
          action={PATH}
          aria-label="Filtrar actividad"
        >
          <div className={styles.field}>
            <label htmlFor="filter-action">Acción</label>
            <select
              id="filter-action"
              name="accion"
              className={styles.select}
              defaultValue={action ?? ""}
            >
              <option value="">Todas</option>
              {Object.entries(ACTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.toolbarActions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
            >
              Filtrar
            </button>
            {action ? (
              <Link
                href={PATH}
                className={`${styles.button} ${styles.secondary}`}
              >
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
        <section className={styles.card} aria-label="Eventos">
          <ActivityList items={items} showTarget />
        </section>
        {page > 1 || hasMore ? (
          <nav className={styles.pager} aria-label="Páginas de actividad">
            {page > 1 ? (
              <Link
                href={href(action, page - 1)}
                className={`${styles.button} ${styles.secondary}`}
              >
                ← Más recientes
              </Link>
            ) : null}
            {hasMore ? (
              <Link
                href={href(action, page + 1)}
                className={`${styles.button} ${styles.secondary}`}
              >
                Más antiguas →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
