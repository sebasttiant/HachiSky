"use client";

import { useState } from "react";
import type { ActionState } from "./action-state.ts";
import styles from "./admin.module.css";
import { FieldError, fieldProps } from "./FormMessage.tsx";
import { TEMPORARY_PASSWORD_MIN } from "./forms.ts";
import { generateTemporaryPassword } from "./presentation.ts";

export function PasswordField({
  id,
  label,
  state,
}: {
  id: string;
  label: string;
  state: ActionState;
}) {
  const name = "temporaryPassword";
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordRow}>
        <input
          id={id}
          name={name}
          className={styles.input}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setCopied(false);
          }}
          autoComplete="new-password"
          minLength={TEMPORARY_PASSWORD_MIN}
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
      <div className={styles.formActions}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={() => {
            setValue(generateTemporaryPassword());
            setVisible(true);
            setCopied(false);
          }}
        >
          Generar una segura
        </button>
        {value ? (
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={copy}
          >
            {copied ? "Copiada" : "Copiar"}
          </button>
        ) : null}
      </div>
      <span className={styles.help}>
        Mínimo {TEMPORARY_PASSWORD_MIN} caracteres. Compártela en persona o por
        un canal privado: al entrar se le pedirá cambiarla.
      </span>
      <FieldError state={state} name={name} />
    </div>
  );
}
