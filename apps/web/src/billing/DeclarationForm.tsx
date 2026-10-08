"use client";

import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import { DECLARATION_BODY_MAX, DECLARATION_LABEL_MAX } from "./validation.ts";

export interface DeclarationFormValues {
  label: string;
  body: string;
}

// Shared by "Nueva declaración" and the edit page. The server validates and
// answers with Spanish field errors; nothing here is trusted.
export function DeclarationForm({
  action,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  values?: DeclarationFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="declaration-label">Nombre</label>
          <input
            id="declaration-label"
            name="label"
            className={styles.input}
            defaultValue={values?.label ?? ""}
            autoComplete="off"
            required
            maxLength={DECLARATION_LABEL_MAX}
            {...fieldProps(state, "label")}
          />
          <FieldError state={state} name="label" />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="declaration-body">Texto de la declaración</label>
          <textarea
            id="declaration-body"
            name="body"
            className={`${styles.input} ${styles.textarea}`}
            defaultValue={values?.body ?? ""}
            required
            maxLength={DECLARATION_BODY_MAX}
            aria-describedby={
              state.fieldErrors?.body ? "body-error" : "declaration-body-help"
            }
            aria-invalid={state.fieldErrors?.body ? true : undefined}
          />
          <span id="declaration-body-help" className={styles.help}>
            Se imprime tal como lo escribas, con sus saltos de línea. Editarlo
            no cambia las cuentas de cobro ya emitidas. Máximo{" "}
            {DECLARATION_BODY_MAX} caracteres.
          </span>
          <FieldError state={state} name="body" />
        </div>
      </div>
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
