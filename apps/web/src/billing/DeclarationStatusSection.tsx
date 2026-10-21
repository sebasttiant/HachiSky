import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// Declarations are deactivated, never deleted. Issued documents keep the text
// they were issued with either way.
export function DeclarationStatusSection({
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
        Estado de la declaración
      </h2>
      <p className={styles.cardHint}>
        Las declaraciones no se borran: se desactivan y su texto se conserva.
      </p>
      {active ? (
        <ConfirmAction
          action={deactivate}
          label="Desactivar declaración"
          confirmLabel="Sí, desactivar"
          warning={`“${label}” dejará de ofrecerse en cuentas de cobro nuevas. Puedes reactivarla después.`}
        />
      ) : (
        <ConfirmAction
          action={reactivate}
          label="Reactivar declaración"
          confirmLabel="Sí, reactivar"
          warning={`“${label}” volverá a ofrecerse en cuentas de cobro nuevas.`}
          tone="primary"
        />
      )}
    </section>
  );
}
