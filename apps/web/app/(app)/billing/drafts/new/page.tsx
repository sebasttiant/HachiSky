import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createDraftAction } from "../../../../../src/billing/draft-actions.ts";
import { getDraftOptions } from "../../../../../src/billing/drafts.ts";
import { NewDraftForm } from "../../../../../src/billing/NewDraftForm.tsx";
import { getDb } from "../../../../../src/db/client.ts";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nueva cuenta de cobro" };

export default async function NewDraftPage() {
  const { user } = await requireModule("billing", "/billing/drafts/new");
  const { clients, issuers } = await getDraftOptions(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );
  return (
    <div className="container">
      <Link href="/billing" className={styles.breadcrumb}>
        ← Cuentas de cobro
      </Link>
      <PageHeader
        moduleId="billing"
        title="Nueva cuenta de cobro"
        description="Elige el cliente, el emisor y la moneda. Después agregas las líneas, la cuenta bancaria y quién firma."
      />
      <section className={styles.card} aria-labelledby="new-draft-title">
        <h2 id="new-draft-title" className="sr-only">
          Datos para empezar
        </h2>
        <NewDraftForm
          action={createDraftAction}
          options={{ clients, issuers }}
        />
      </section>
    </div>
  );
}
