import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// Signers are deactivated, never deleted, so issued documents keep their
// signer and exact signature version.
export function SignerStatusSection({
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
        Estado del firmante
      </h2>
      <p className={styles.cardHint}>
        Los firmantes no se borran: se desactivan y su información y sus firmas
        se conservan.
      </p>
      {active ? (
        <ConfirmAction
          action={deactivate}
          label="Desactivar firmante"
          confirmLabel="Sí, desactivar"
          warning={`${label} dejará de ofrecerse como firmante en documentos nuevos. Puedes reactivarlo después.`}
        />
      ) : (
        <ConfirmAction
          action={reactivate}
          label="Reactivar firmante"
          confirmLabel="Sí, reactivar"
          warning={`${label} volverá a ofrecerse como firmante en documentos nuevos.`}
          tone="primary"
        />
      )}
    </section>
  );
}
