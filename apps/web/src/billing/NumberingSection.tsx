"use client";

import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import type { NumberingState } from "./numbering.ts";

// Where this issuer's consecutive stands. The series is continuous per
// issuer and does not depend on the client or the site. Saving a draft or
// copying one never moves it: a number is taken when the document is
// issued, which is not available yet.
export function NumberingSection({
  numbering,
  action,
}: {
  numbering: NumberingState;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <section className={styles.card} aria-labelledby="numbering-title">
      <h2 id="numbering-title" className={styles.cardTitle}>
        Consecutivo
      </h2>
      <p className={styles.cardHint}>
        Una sola numeración por emisor, igual para todos los clientes y sedes.
        Indica desde qué número continúa y la plataforma propone el siguiente.
        El consecutivo solo avanza: no vuelve sobre un número ya usado.
      </p>

      <dl className={styles.summary}>
        <div>
          <dt>Último registrado aquí</dt>
          <dd>
            {numbering.lastRegisteredFormatted ?? (
              <span className={styles.muted}>Ninguno todavía</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Siguiente sugerido</dt>
          <dd>
            {numbering.nextFormatted ?? (
              <span className={styles.muted}>Sin configurar</span>
            )}
          </dd>
        </div>
      </dl>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="numbering-next">Continuar desde el número</label>
            <input
              id="numbering-next"
              name="nextNumber"
              className={styles.input}
              type="text"
              inputMode="numeric"
              defaultValue={numbering.nextNumber ?? ""}
              autoComplete="off"
              required
              aria-describedby={
                state.fieldErrors?.nextNumber
                  ? "nextNumber-error"
                  : "numbering-next-help"
              }
              aria-invalid={state.fieldErrors?.nextNumber ? true : undefined}
              {...fieldProps(state, "nextNumber")}
            />
            <span id="numbering-next-help" className={styles.help}>
              Solo el número: se imprime como CC-0001. Si vienes de otra
              numeración, escribe el que sigue a tu última cuenta de cobro.
            </span>
            <FieldError state={state} name="nextNumber" />
          </div>
        </div>
        <FormMessage state={state} />
        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={pending}
          >
            {pending ? "Guardando…" : "Guardar consecutivo"}
          </button>
        </div>
      </form>
    </section>
  );
}
