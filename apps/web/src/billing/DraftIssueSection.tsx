import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";

// Issuing gives the cuenta its consecutive and closes it: from then on it
// carries its number and date, and it is no longer edited as a draft.
export function DraftIssueSection({
  issue,
  nextFormatted,
}: {
  issue: (previous: ActionState) => Promise<ActionState>;
  nextFormatted: string | null;
}) {
  return (
    <section className={styles.card} aria-labelledby="issue-title">
      <h2 id="issue-title" className={styles.cardTitle}>
        Emitir
      </h2>
      <p className={styles.cardHint}>
        {nextFormatted
          ? `Al emitirla recibirá el consecutivo ${nextFormatted} y dejará de ser un borrador: ya no se podrá editar ni descartar.`
          : "Todavía no hay consecutivo configurado para este emisor. Indica desde qué número continúa en la página del emisor."}
      </p>
      <ConfirmAction
        action={issue}
        label="Emitir cuenta de cobro"
        confirmLabel="Sí, emitir"
        warning={
          nextFormatted
            ? `Esta cuenta de cobro se emitirá con el número ${nextFormatted}. No se puede deshacer.`
            : "Esta cuenta de cobro se emitirá con el siguiente número de su serie. No se puede deshacer."
        }
        tone="primary"
      />
    </section>
  );
}
