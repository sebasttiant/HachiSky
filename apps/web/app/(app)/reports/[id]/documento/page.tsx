import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { PrintButton } from "../../../../../src/billing/PrintButton.tsx";
import { getDb } from "../../../../../src/db/client.ts";
import { listImages } from "../../../../../src/reports/images.ts";
import { reportPath } from "../../../../../src/reports/paths.ts";
import { ReportSheet } from "../../../../../src/reports/ReportSheet.tsx";
import { getReport } from "../../../../../src/reports/service.ts";
import ui from "../../../../../src/users/admin.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Documento del informe" };

export default async function ReportDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireModule("reports", `/reports/${id}/documento`);
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const report = await getReport(deps, actor, id);
  // Absent and unreachable answer the same, here as everywhere else.
  if (!report) notFound();

  // Checked again by the service, against the same ownership rule as the
  // report itself.
  const images = await listImages(deps, actor, id);

  return (
    <div className="container">
      {/* Hidden when printing, so the sheet is the whole page. */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <Link href={reportPath(id)} className={styles.back}>
            ← Volver al informe
          </Link>
          <PrintButton className={`${ui.button} ${ui.primary}`}>
            Exportar a PDF
          </PrintButton>
        </div>
        <p className={styles.hint}>
          Así se verá el informe. Las secciones vacías no aparecen: lléna las
          que falten desde el informe. “Exportar a PDF” abre la impresión del
          navegador; elegí “Guardar como PDF”.
        </p>
      </div>

      <ReportSheet report={report} images={images} />
    </div>
  );
}
