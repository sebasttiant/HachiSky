"use client";

import type { ActionState } from "./action-state.ts";
import styles from "./admin.module.css";
import { FormMessage } from "./FormMessage.tsx";
import { PasswordField } from "./PasswordField.tsx";
import { useFormAction } from "./useFormAction.ts";

export function ResetPasswordForm({
  action,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <PasswordField
        id="reset-password"
        label="Nueva contraseña temporal"
        state={state}
      />
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.secondary}`}
          disabled={pending}
        >
          {pending ? "Asignando…" : "Asignar contraseña temporal"}
        </button>
      </div>
    </form>
  );
}
