import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// A draft has no number, so discarding it deletes it with its lines. The
// activity log keeps a record that it existed.
export function DraftDiscardSection({
  discard,
}: {
  discard: (previous: ActionState) => Promise<ActionState>;
}) {
  return (
    <section className={styles.card} aria-labelledby="discard-title">
      <h2 id="discard-title" className={styles.cardTitle}>
        Descartar
      </h2>
      <p className={styles.cardHint}>
        Este borrador todavía no tiene número. Si lo descartas se borra con sus
        líneas y no se puede recuperar.
      </p>
      <ConfirmAction
        action={discard}
        label="Descartar borrador"
        confirmLabel="Sí, descartar"
        warning="El borrador y sus líneas se borrarán. Esta acción no se puede deshacer."
      />
    </section>
  );
}
