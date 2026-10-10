import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../../src/auth/guard.ts";
import { CuentaDeCobroSheet } from "../../../../../../src/billing/CuentaDeCobroSheet.tsx";
import { getDocumentView } from "../../../../../../src/billing/document.ts";
import { draftPath } from "../../../../../../src/billing/paths.ts";
import { BillingRuleError } from "../../../../../../src/billing/service.ts";
import { getDb } from "../../../../../../src/db/client.ts";
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
        <Link href={draftPath(id)} className={styles.back}>
          ← Volver al borrador
        </Link>
        <p className={styles.hint}>
          Así se verá la cuenta de cobro. Todavía no tiene número: se asigna al
          emitirla. Para guardarla en PDF usa la impresión del navegador.
        </p>
      </div>

      <CuentaDeCobroSheet view={view} />
    </div>
  );
}
