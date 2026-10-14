import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../src/auth/guard.ts";
import { getDb } from "../../../src/db/client.ts";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "../../../src/users/admin.module.css";
import { ActivityList } from "../../../src/work/ActivityList.tsx";
import { NEW_ACTIVITY_PATH } from "../../../src/work/paths.ts";
import { listActivities } from "../../../src/work/service.ts";

export const metadata: Metadata = { title: "Trabajo" };

// Always current: an activity recorded a moment ago has to be in this list.
export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const { user } = await requireModule("work", "/work");
  // The service scopes the list by itself: staff see only what they recorded,
  // administrators see every entry.
  const activities = await listActivities(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );

  return (
    <div className="container">
      <PageHeader
        moduleId="work"
        title="Trabajo"
        description="Lo que se hizo para cada cliente: fecha, horario, resultado y lo que queda pendiente."
        actions={
          <Link
            href={NEW_ACTIVITY_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nueva actividad
          </Link>
        }
      />
      <section aria-labelledby="activities-title" className={styles.stack}>
        <h2 id="activities-title" className="sr-only">
          Actividades registradas
        </h2>
        <ActivityList items={activities} />
      </section>
    </div>
  );
}
