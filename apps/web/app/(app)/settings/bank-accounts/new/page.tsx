import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createBankAccountAction } from "../../../../../src/billing/actions.ts";
import { BankAccountForm } from "../../../../../src/billing/BankAccountForm.tsx";
import { listIssuers } from "../../../../../src/billing/issuers.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nueva cuenta bancaria" };

export default async function NewBankAccountPage() {
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("settings", "/settings/bank-accounts/new");
  const issuers = (
    await listIssuers(
      { db: getDb() },
      { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    )
  ).filter((issuer) => issuer.active);
  return (
    <div className="container">
      <Link href="/settings/bank-accounts" className={styles.breadcrumb}>
        ← Cuentas bancarias
      </Link>
      <PageHeader
        moduleId="settings"
        title="Nueva cuenta bancaria"
        description="Elige el emisor al que pertenece la cuenta y escribe sus datos. El titular y la moneda se muestran en cada documento."
      />
      <section className={styles.card} aria-labelledby="new-account-title">
        <h2 id="new-account-title" className="sr-only">
          Datos de la cuenta
        </h2>
        <BankAccountForm
          action={createBankAccountAction}
          issuers={issuers}
          submitLabel="Crear cuenta"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
