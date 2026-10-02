import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { createBankAccountAction } from "../../../../../src/billing/actions.ts";
import { BankAccountForm } from "../../../../../src/billing/BankAccountForm.tsx";
import { PageHeader } from "../../../../../src/shell/PageHeader.tsx";
import styles from "../../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nueva cuenta bancaria" };

export default async function NewBankAccountPage() {
  await requireModule("settings", "/settings/bank-accounts/new");
  return (
    <div className="container">
      <Link href="/settings/bank-accounts" className={styles.breadcrumb}>
        ← Cuentas bancarias
      </Link>
      <PageHeader
        moduleId="settings"
        title="Nueva cuenta bancaria"
        description="Escribe los datos de la cuenta. El titular y la moneda se muestran en cada documento."
      />
      <section className={styles.card} aria-labelledby="new-account-title">
        <h2 id="new-account-title" className="sr-only">
          Datos de la cuenta
        </h2>
        <BankAccountForm
          action={createBankAccountAction}
          submitLabel="Crear cuenta"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
