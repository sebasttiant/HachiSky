import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { BankAccountList } from "../../../../src/billing/BankAccountList.tsx";
import { NEW_BANK_ACCOUNT_PATH } from "../../../../src/billing/paths.ts";
import { listBankAccounts } from "../../../../src/billing/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Cuentas bancarias" };

export default async function BankAccountsPage() {
  const { user } = await requireModule("settings", "/settings/bank-accounts");
  const items = await listBankAccounts(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
  );

  return (
    <div className="container">
      <Link href="/settings" className={styles.breadcrumb}>
        ← Configuración
      </Link>
      <PageHeader
        moduleId="settings"
        title="Cuentas bancarias"
        description="Cuentas donde los clientes pagan las cuentas de cobro. Cada una pertenece a un emisor e indica su titular y su moneda. Las cuentas no se borran: se desactivan."
        actions={
          <Link
            href={NEW_BANK_ACCOUNT_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nueva cuenta
          </Link>
        }
      />
      <section aria-labelledby="accounts-title" className={styles.stack}>
        <h2 id="accounts-title" className="sr-only">
          Lista de cuentas bancarias
        </h2>
        <BankAccountList items={items} />
      </section>
    </div>
  );
}
