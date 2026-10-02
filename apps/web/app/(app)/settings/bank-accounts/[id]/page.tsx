import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import {
  setBankAccountActiveAction,
  updateBankAccountAction,
} from "../../../../../src/billing/actions.ts";
import { BankAccountForm } from "../../../../../src/billing/BankAccountForm.tsx";
import { BankAccountStatusSection } from "../../../../../src/billing/BankAccountStatusSection.tsx";
import { getBankAccount } from "../../../../../src/billing/service.ts";
import { ACCOUNT_TYPE_LABEL } from "../../../../../src/billing/validation.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import styles from "../../../../../src/users/admin.module.css";
import { StatusBadge } from "../../../../../src/users/Badges.tsx";

export const metadata: Metadata = { title: "Cuenta bancaria" };

export default async function BankAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("settings", `/settings/bank-accounts/${id}`);
  const account = await getBankAccount(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
  if (!account) notFound();
  const justCreated = (await searchParams).creada === "1";

  return (
    <div className="container">
      <Link href="/settings/bank-accounts" className={styles.breadcrumb}>
        ← Cuentas bancarias
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>
            {account.bankName} · {account.currency}
          </h1>
          <span className={styles.muted}>
            {ACCOUNT_TYPE_LABEL[account.accountType]} · {account.accountNumber}{" "}
            · Titular: {account.holderName}
          </span>
        </div>
        <div className={styles.badges}>
          <StatusBadge active={account.active} />
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Cuenta creada.
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos de la cuenta
            </h2>
            <BankAccountForm
              action={updateBankAccountAction.bind(null, account.id)}
              values={account}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>
          <BankAccountStatusSection
            active={account.active}
            label={`${account.bankName} (${account.currency})`}
            deactivate={setBankAccountActiveAction.bind(
              null,
              account.id,
              false,
            )}
            reactivate={setBankAccountActiveAction.bind(null, account.id, true)}
          />
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Creada</dt>
                <dd>{formatDateTime(account.createdAt)}</dd>
              </div>
              <div>
                <dt>Última modificación</dt>
                <dd>{formatDateTime(account.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
