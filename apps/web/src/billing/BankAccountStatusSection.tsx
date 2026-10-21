import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// Bank accounts are deactivated, never deleted, so documents already issued
// keep a valid reference. The whole screen is admin-only (guarded on the
// server); there is no per-role variant here.
export function BankAccountStatusSection({
  active,
  label,
  deactivate,
  reactivate,
}: {
  active: boolean;
  label: string;
  deactivate: (previous: ActionState) => Promise<ActionState>;
  reactivate: (previous: ActionState) => Promise<ActionState>;
}) {
  return (
    <section className={styles.card} aria-labelledby="status-title">
      <h2 id="status-title" className={styles.cardTitle}>
        Estado de la cuenta
      </h2>
      <p className={styles.cardHint}>
        Las cuentas no se borran: se desactivan y su información se conserva.
      </p>
      {active ? (
        <ConfirmAction
          action={deactivate}
          label="Desactivar cuenta"
          confirmLabel="Sí, desactivar"
          warning={`La cuenta de ${label} dejará de ofrecerse en documentos nuevos. Puedes reactivarla después.`}
        />
      ) : (
        <ConfirmAction
          action={reactivate}
          label="Reactivar cuenta"
          confirmLabel="Sí, reactivar"
          warning={`La cuenta de ${label} volverá a ofrecerse en documentos nuevos.`}
          tone="primary"
        />
      )}
    </section>
  );
}
