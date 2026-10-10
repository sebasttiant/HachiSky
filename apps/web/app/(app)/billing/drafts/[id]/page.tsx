import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { CuentaDeCobroSheet } from "../../../../../src/billing/CuentaDeCobroSheet.tsx";
import { DraftDiscardSection } from "../../../../../src/billing/DraftDiscardSection.tsx";
import { DraftEditor } from "../../../../../src/billing/DraftEditor.tsx";
import { getDocumentView } from "../../../../../src/billing/document.ts";
import {
  discardDraftAction,
  updateDraftAction,
} from "../../../../../src/billing/draft-actions.ts";
import {
  getDraft,
  getDraftOptions,
} from "../../../../../src/billing/drafts.ts";
import { draftDocumentPath } from "../../../../../src/billing/paths.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import styles from "../../../../../src/users/admin.module.css";
import page from "./page.module.css";

export const metadata: Metadata = { title: "Borrador de cuenta de cobro" };

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { user } = await requireModule("billing", `/billing/drafts/${id}`);
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const draft = await getDraft(deps, actor, id);
  if (!draft) notFound();
  const [options, view] = await Promise.all([
    getDraftOptions(deps, actor, draft),
    getDocumentView(deps, actor, id),
  ]);
  const justCreated = (await searchParams).creado === "1";

  return (
    <div className="container">
      <Link href="/billing" className={styles.breadcrumb}>
        ← Cuentas de cobro
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>Borrador para {draft.client.name}</h1>
          <span className={styles.muted}>
            {draft.issuer.legalName} · Sin número hasta emitirla · Última
            modificación {formatDateTime(draft.updatedAt)}
          </span>
        </div>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.badgePending}`}>
            Borrador
          </span>
          <Link
            href={draftDocumentPath(draft.id)}
            className={`${styles.button} ${styles.secondary}`}
          >
            Ver documento
          </Link>
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Borrador creado. Agrega las líneas y guárdalo.
        </p>
      ) : null}

      <div className={page.workspace}>
        <div className={page.editorColumn}>
          <DraftEditor
            action={updateDraftAction.bind(null, draft.id)}
            draft={draft}
            options={options}
          />
          <DraftDiscardSection
            discard={discardDraftAction.bind(null, draft.id)}
          />
        </div>

        <aside
          className={page.previewColumn}
          aria-label="Vista previa del documento"
        >
          <div className={page.previewPane}>
            <div className={page.previewHeader}>
              <span className={page.previewTitle}>Vista previa</span>
              <span className={page.previewMeta}>
                Última versión guardada · {formatDateTime(draft.updatedAt)}
              </span>
            </div>
            <p className={page.previewHint}>
              Refleja lo guardado. Guarda el borrador para ver aquí tus últimos
              cambios.{" "}
              <Link
                href={draftDocumentPath(draft.id)}
                className={page.printLink}
              >
                Abrir para imprimir o PDF
              </Link>
            </p>
            <div className={page.previewFrame}>
              <CuentaDeCobroSheet view={view} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
