import type { Metadata } from "next";
import { requireSession } from "../../../src/auth/guard.ts";
import { ReportSheet } from "../../../src/reports/ReportSheet.tsx";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Informes" };

export default async function ReportsPage() {
  await requireSession("/reports");
  return (
    <div className="container">
      <PageHeader
        moduleId="reports"
        title="Informes"
        description="Así se verá un informe de actividad listo para compartir con el cliente."
        actions={
          <button type="button" disabled className={styles.disabledButton}>
            Descargar PDF — próximamente
          </button>
        }
      />
      <ReportSheet />
    </div>
  );
}
