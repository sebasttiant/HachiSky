"use client";

import { useState } from "react";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { TEMPORARY_PASSWORD_MIN } from "../users/forms.ts";
import { useFormAction } from "../users/useFormAction.ts";

function SecretField({
  name,
  label,
  autoComplete,
  help,
  state,
}: {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  help?: string;
  state: ActionState;
}) {
  const [visible, setVisible] = useState(false);
  const id = `account-${name}`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordRow}>
        <input
          id={id}
          name={name}
          className={styles.input}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          maxLength={128}
          required
          spellCheck={false}
          {...fieldProps(state, name)}
        />
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {help ? <span className={styles.help}>{help}</span> : null}
      <FieldError state={state} name={name} />
    </div>
  );
}

export function ChangePasswordForm({
  action,
  next,
  mustChange,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  next: string;
  mustChange: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="next" value={next} />
      <SecretField
        name="currentPassword"
        label={mustChange ? "Contraseña temporal" : "Contraseña actual"}
        autoComplete="current-password"
        state={state}
      />
      <SecretField
        name="newPassword"
        label="Nueva contraseña"
        autoComplete="new-password"
        help={`Mínimo ${TEMPORARY_PASSWORD_MIN} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.`}
        state={state}
      />
      <SecretField
        name="confirmPassword"
        label="Repite la nueva contraseña"
        autoComplete="new-password"
        state={state}
      />
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
      </div>
    </form>
  );
}
