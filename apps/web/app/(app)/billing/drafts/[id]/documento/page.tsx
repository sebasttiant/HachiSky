import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../../src/auth/guard.ts";
import { CuentaDeCobroSheet } from "../../../../../../src/billing/CuentaDeCobroSheet.tsx";
import { getDocumentView } from "../../../../../../src/billing/document.ts";
import { PrintButton } from "../../../../../../src/billing/PrintButton.tsx";
import { draftPath } from "../../../../../../src/billing/paths.ts";
import { BillingRuleError } from "../../../../../../src/billing/service.ts";
import { getDb } from "../../../../../../src/db/client.ts";
import ui from "../../../../../../src/users/admin.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Documento del borrador" };

export default async function DraftDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // biome-ignore format: the guard call stays on one line, like the other billing routes.
  const { user } = await requireModule("billing", `/billing/drafts/${id}/documento`);
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };

  let view: Awaited<ReturnType<typeof getDocumentView>>;
  try {
    view = await getDocumentView(deps, actor, id);
  } catch (error) {
    if (error instanceof BillingRuleError) notFound();
    throw error;
  }

  return (
    <div className="container">
      {/* Hidden when printing, so the sheet is the whole page. */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          {view.status === "issued" ? (
            <Link href="/billing" className={styles.back}>
              ← Cuentas de cobro
            </Link>
          ) : (
            <Link href={draftPath(id)} className={styles.back}>
              ← Volver al borrador
            </Link>
          )}
          <PrintButton className={`${ui.button} ${ui.primary}`}>
            Exportar a PDF
          </PrintButton>
        </div>
        <p className={styles.hint}>
          {view.status === "issued"
            ? `Cuenta de cobro emitida${view.number ? ` con el consecutivo ${view.number}` : ""}. “Exportar a PDF” abre la impresión del navegador; elegí “Guardar como PDF”.`
            : "Así se verá la cuenta de cobro. Todavía no tiene número: se asigna al emitirla. “Exportar a PDF” abre la impresión del navegador; elegí “Guardar como PDF”."}
        </p>
      </div>

      <CuentaDeCobroSheet view={view} />
    </div>
  );
}
