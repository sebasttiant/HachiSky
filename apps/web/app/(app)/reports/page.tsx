import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../src/auth/guard.ts";
import { getDb } from "../../../src/db/client.ts";
import { NEW_REPORT_PATH } from "../../../src/reports/paths.ts";
import { ReportList } from "../../../src/reports/ReportList.tsx";
import { listReports } from "../../../src/reports/service.ts";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Informes" };

// Always current: a report saved a moment ago has to be in this list.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { user } = await requireModule("reports", "/reports");
  // The service scopes the list by itself: staff see only the reports they
  // authored, administrators see every one.
  const reports = await listReports(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );

  return (
    <div className="container">
      <PageHeader
        moduleId="reports"
        title="Informes"
        description="Diagnósticos, seguimientos, informes de gestión, levantamientos de infraestructura y manuales de entrega."
        actions={
          <Link
            href={NEW_REPORT_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nuevo informe
          </Link>
        }
      />
      <section aria-labelledby="reports-title" className={styles.stack}>
        <h2 id="reports-title" className="sr-only">
          Informes guardados
        </h2>
        <ReportList items={reports} />
      </section>
    </div>
  );
}
