import Link from "next/link";
import styles from "../users/admin.module.css";
import { StatusBadge } from "../users/Badges.tsx";
import { bankAccountPath, NEW_BANK_ACCOUNT_PATH } from "./paths.ts";
import type { BankAccountRecord } from "./service.ts";
import { ACCOUNT_TYPE_LABEL } from "./validation.ts";

function holder(account: BankAccountRecord) {
  return `${account.holderIdentificationType} ${account.holderIdentificationNumber}`;
}

function issuerName(account: BankAccountRecord) {
  if (!account.issuer) return "Sin emisor asignado";
  return account.issuer.active
    ? account.issuer.legalName
    : `${account.issuer.legalName} (inactivo)`;
}

function EmptyList() {
  return (
    <div className={styles.empty}>
      <h2>Todavía no hay cuentas bancarias</h2>
      <p>
        Agrega la primera con “Nueva cuenta”. Cada cuenta indica su titular y su
        moneda.
      </p>
      <Link
        href={NEW_BANK_ACCOUNT_PATH}
        className={`${styles.button} ${styles.primary}`}
      >
        Nueva cuenta
      </Link>
    </div>
  );
}

// Issuer, holder and currency are always visible: they decide which
// accounts a document of that issuer and currency may use.
export function BankAccountList({
  items,
}: {
  items: readonly BankAccountRecord[];
}) {
  if (items.length === 0) return <EmptyList />;

  return (
    <div className={styles.stack}>
      <ul className={styles.cards}>
        {items.map((account) => (
          <li key={account.id} className={styles.userCard}>
            <div className={styles.identity}>
              <strong>
                {account.bankName} · {account.currency}
              </strong>
              <span className={styles.muted}>
                {ACCOUNT_TYPE_LABEL[account.accountType]} ·{" "}
                {account.accountNumber}
              </span>
              <span className={styles.muted}>
                Titular: {account.holderName} ({holder(account)})
              </span>
              <span className={styles.muted}>
                Emisor: {issuerName(account)}
              </span>
            </div>
            <div className={styles.badges}>
              <StatusBadge active={account.active} />
            </div>
            <Link
              href={bankAccountPath(account.id)}
              className={`${styles.button} ${styles.secondary}`}
              aria-label={`Ver la cuenta de ${account.bankName} de ${account.holderName}`}
            >
              Ver
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Emisor</th>
              <th scope="col">Banco</th>
              <th scope="col">Tipo</th>
              <th scope="col">Número</th>
              <th scope="col">Titular</th>
              <th scope="col">Moneda</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((account) => (
              <tr
                key={account.id}
                className={account.active ? "" : styles.rowInactive}
              >
                <td>{issuerName(account)}</td>
                <td>
                  <strong>{account.bankName}</strong>
                </td>
                <td>{ACCOUNT_TYPE_LABEL[account.accountType]}</td>
                <td>{account.accountNumber}</td>
                <td>
                  {account.holderName}
                  <br />
                  <span className={styles.muted}>{holder(account)}</span>
                </td>
                <td>
                  <strong>{account.currency}</strong>
                </td>
                <td>
                  <StatusBadge active={account.active} />
                </td>
                <td>
                  <Link
                    href={bankAccountPath(account.id)}
                    className={`${styles.button} ${styles.secondary}`}
                    aria-label={`Ver la cuenta de ${account.bankName} de ${account.holderName}`}
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
