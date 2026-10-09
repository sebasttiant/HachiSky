import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../src/auth/guard.ts";
import { DraftList } from "../../../src/billing/DraftList.tsx";
import { listDrafts } from "../../../src/billing/drafts.ts";
import { NEW_DRAFT_PATH } from "../../../src/billing/paths.ts";
import { getDb } from "../../../src/db/client.ts";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Facturación" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireModule("billing", "/billing");
  const items = await listDrafts(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );
  const discarded = (await searchParams).descartado === "1";

  return (
    <div className="container">
      <PageHeader
        moduleId="billing"
        title="Cuentas de cobro"
        description="Prepara cuentas de cobro para tus clientes. Un borrador se puede editar o descartar; recibe su número cuando se emite."
        actions={
          <Link
            href={NEW_DRAFT_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nueva cuenta de cobro
          </Link>
        }
      />
      {discarded ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Borrador descartado.
        </p>
      ) : null}
      <section aria-labelledby="drafts-title" className={styles.stack}>
        <h2 id="drafts-title" className="sr-only">
          Borradores
        </h2>
        <DraftList items={items} />
      </section>
    </div>
  );
}
