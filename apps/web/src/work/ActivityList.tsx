import Link from "next/link";
import { formatDate } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";
import { activityPath, NEW_ACTIVITY_PATH } from "./paths.ts";
import type { ActivityRecord } from "./service.ts";
import { ACTIVITY_STATUS_LABEL, type ActivityStatus } from "./validation.ts";

function hours(activity: ActivityRecord) {
  return activity.startedAt && activity.endedAt
    ? `${activity.startedAt}–${activity.endedAt}`
    : "Sin horario";
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const className =
    status === "completed"
      ? styles.badgeActive
      : status === "in_progress"
        ? styles.badgePending
        : styles.badgeStaff;
  return (
    <span className={`${styles.badge} ${className}`}>
      {ACTIVITY_STATUS_LABEL[status]}
    </span>
  );
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay actividades registradas</h2>
      <p>
        No es un error: cuando registres trabajo para un cliente aparecerá aquí.
      </p>
      <Link
        href={NEW_ACTIVITY_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nueva actividad
      </Link>
    </div>
  );
}

// Activities are shown as cards on small screens and as a table on desktop,
// matching the admin lists so the module changes layout without new CSS.
export function ActivityList({ items }: { items: readonly ActivityRecord[] }) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((activity) => (
          <li key={activity.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>{activity.title}</strong>
              <span className={styles.muted}>{activity.clientName}</span>
              <span>
                {formatDate(activity.performedOn)} · {hours(activity)}
              </span>
            </div>
            <div className={styles.badges}>
              <StatusBadge status={activity.status} />
            </div>
            <Link
              href={activityPath(activity.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Abrir la actividad ${activity.title}`}
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
              <th scope="col">Fecha</th>
              <th scope="col">Horario</th>
              <th scope="col">Actividad</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((activity) => (
              <tr key={activity.id}>
                <td>
                  <strong>{activity.clientName}</strong>
                </td>
                <td>{formatDate(activity.performedOn)}</td>
                <td>{hours(activity)}</td>
                <td>{activity.title}</td>
                <td>
                  <StatusBadge status={activity.status} />
                </td>
                <td>
                  <Link
                    href={activityPath(activity.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Abrir la actividad ${activity.title}`}
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
