import Link from "next/link";
import { formatDateTime } from "../shared/format/date.ts";
import styles from "./admin.module.css";
import { USERS_PATH } from "./filters.ts";
import { actionLabel } from "./presentation.ts";

export interface ActivityItem {
  id: number;
  occurredAt: Date;
  action: string;
  actorName: string | null;
  targetUserId?: string | null;
  targetName?: string | null;
  details?: Record<string, unknown>;
}

const DANGER = new Set([
  "user.deactivate",
  "user.sessions_revoke",
  "client.deactivate",
]);
const OK = new Set([
  "user.create",
  "user.activate",
  "client.create",
  "client.activate",
]);

// Client actions have no target user; the audit details carry the client name.
function clientName(item: ActivityItem): string | null {
  const name = item.details?.name;
  return item.action.startsWith("client.") && typeof name === "string"
    ? name
    : null;
}

export function ActivityList({
  items,
  showTarget = false,
}: {
  items: readonly ActivityItem[];
  showTarget?: boolean;
}) {
  if (items.length === 0) {
    return <p className={styles.muted}>Todavía no hay actividad registrada.</p>;
  }
  return (
    <ol className={styles.timeline}>
      {items.map((item) => (
        <li key={item.id} className={styles.event}>
          <span
            className={`${styles.dot} ${DANGER.has(item.action) ? styles.dotDanger : OK.has(item.action) ? styles.dotOk : ""}`}
            aria-hidden="true"
          />
          <div className={styles.eventText}>
            <strong>
              {actionLabel(item.action)}
              {clientName(item) ? ` · ${clientName(item)}` : null}
              {showTarget && item.targetUserId ? (
                <>
                  {" · "}
                  <Link
                    href={`${USERS_PATH}/${encodeURIComponent(item.targetUserId)}`}
                  >
                    {item.targetName ?? "Usuario"}
                  </Link>
                </>
              ) : null}
            </strong>
            <span className={styles.muted}>
              {item.actorName ?? "Sistema"} ·{" "}
              <time dateTime={item.occurredAt.toISOString()}>
                {formatDateTime(item.occurredAt)}
              </time>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
