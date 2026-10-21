import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// Issuers are deactivated, never deleted, so issued documents keep their
// issuer. The default issuer cannot be deactivated: another active issuer
// must be made the default first (nothing is reassigned silently).
export function IssuerStatusSection({
  active,
  isDefault,
  label,
  deactivate,
  reactivate,
  makeDefault,
}: {
  active: boolean;
  isDefault: boolean;
  label: string;
  deactivate: (previous: ActionState) => Promise<ActionState>;
  reactivate: (previous: ActionState) => Promise<ActionState>;
  makeDefault: (previous: ActionState) => Promise<ActionState>;
}) {
  return (
    <section className={styles.card} aria-labelledby="status-title">
      <h2 id="status-title" className={styles.cardTitle}>
        Estado del emisor
      </h2>
      <p className={styles.cardHint}>
        Los emisores no se borran: se desactivan y su información y sus logos se
        conservan. El emisor predeterminado se propone en las cuentas de cobro
        nuevas.
      </p>
      {isDefault ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          Este es el emisor predeterminado. Para desactivarlo, elige primero
          otro emisor como predeterminado.
        </p>
      ) : active ? (
        <>
          <ConfirmAction
            action={makeDefault}
            label="Usar como predeterminado"
            confirmLabel="Sí, usar como predeterminado"
            warning={`${label} se propondrá en las cuentas de cobro nuevas en lugar del emisor predeterminado actual.`}
            tone="primary"
          />
          <ConfirmAction
            action={deactivate}
            label="Desactivar emisor"
            confirmLabel="Sí, desactivar"
            warning={`${label} dejará de ofrecerse como emisor y no se le podrán asignar cuentas bancarias. Puedes reactivarlo después.`}
          />
        </>
      ) : (
        <ConfirmAction
          action={reactivate}
          label="Reactivar emisor"
          confirmLabel="Sí, reactivar"
          warning={`${label} volverá a ofrecerse como emisor.`}
          tone="primary"
        />
      )}
    </section>
  );
}
