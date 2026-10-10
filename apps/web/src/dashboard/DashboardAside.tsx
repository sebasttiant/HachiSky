import Link from "next/link";
import {
  BANK_ACCOUNTS_PATH,
  BILLING_PATH,
  ISSUERS_PATH,
  NEW_DRAFT_PATH,
  SETTINGS_PATH,
  SIGNERS_PATH,
} from "../billing/paths.ts";
import { getDb } from "../db/client.ts";
import styles from "./DashboardAside.module.css";
import { type DashboardActor, getDashboardMetrics } from "./metrics.ts";

// What still needs a decision, and where to go and make it. Every item is a
// real count; when there is nothing pending the panel says so instead of
// filling the space with a status that never changes.

interface PendingItem {
  label: string;
  href: string;
}

export function DashboardAsideFallback() {
  return (
    <section
      className={styles.panel}
      aria-labelledby="aside-title"
      aria-busy="true"
    >
      <h2 id="aside-title" className={styles.title}>
        Pendientes
      </h2>
      <p role="status" className={styles.muted}>
        Consultando…
      </p>
    </section>
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export async function DashboardAside({ actor }: { actor: DashboardActor }) {
  const metrics = await getDashboardMetrics({ db: getDb() }, actor);
  const { pending, billingSetup } = metrics;

  const items: PendingItem[] = [];
  if (pending.draftsWithoutLines > 0) {
    items.push({
      label: `${pending.draftsWithoutLines} ${plural(pending.draftsWithoutLines, "borrador sin conceptos", "borradores sin conceptos")}`,
      href: BILLING_PATH,
    });
  }
  if (pending.draftsWithoutSigner > 0) {
    items.push({
      label: `${pending.draftsWithoutSigner} ${plural(pending.draftsWithoutSigner, "borrador sin firmante", "borradores sin firmante")}`,
      href: BILLING_PATH,
    });
  }
  if (pending.draftsWithoutBankAccount > 0) {
    items.push({
      label: `${pending.draftsWithoutBankAccount} ${plural(pending.draftsWithoutBankAccount, "borrador sin cuenta bancaria", "borradores sin cuenta bancaria")}`,
      href: BILLING_PATH,
    });
  }
  if (billingSetup.issuers === 0) {
    items.push({ label: "Sin emisores configurados", href: ISSUERS_PATH });
  }
  if (billingSetup.signers === 0) {
    items.push({ label: "Sin firmantes configurados", href: SIGNERS_PATH });
  }
  if (billingSetup.bankAccounts === 0) {
    items.push({
      label: "Sin cuentas bancarias configuradas",
      href: BANK_ACCOUNTS_PATH,
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="aside-title">
      <h2 id="aside-title" className={styles.title}>
        Pendientes
      </h2>

      {items.length === 0 ? (
        <p className={styles.clear}>
          Nada pendiente. Tus borradores tienen conceptos, firmante y cuenta.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.label} className={styles.item}>
              <Link href={item.href} className={styles.itemLink}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3 className={styles.subtitle}>Accesos rápidos</h3>
      <div className={styles.actions}>
        <Link href={NEW_DRAFT_PATH} className={styles.action}>
          Nueva cuenta de cobro
        </Link>
        <Link href="/clients/new" className={styles.action}>
          Nuevo cliente
        </Link>
        <Link href={SETTINGS_PATH} className={styles.action}>
          Configuración
        </Link>
      </div>
    </section>
  );
}
