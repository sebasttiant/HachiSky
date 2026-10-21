"use client";

import {
  type ReactNode,
  startTransition,
  useActionState,
  useState,
} from "react";
import { type ActionState, IDLE } from "./action-state.ts";
import styles from "./admin.module.css";
import { FormMessage } from "./FormMessage.tsx";

// Two-step inline confirmation: the first click explains what will happen,
// the second one runs the action.
export function ConfirmAction({
  action,
  label,
  confirmLabel,
  warning,
  tone = "danger",
}: {
  action: (previous: ActionState) => Promise<ActionState>;
  label: string;
  confirmLabel: string;
  warning: ReactNode;
  tone?: "danger" | "primary";
}) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <fieldset className={styles.confirmBox}>
        <legend className="sr-only">{label}</legend>
        <p>{warning}</p>
        <div className={styles.formActions}>
          <button
            type="button"
            className={`${styles.button} ${tone === "danger" ? styles.danger : styles.primary}`}
            onClick={() => {
              setConfirming(false);
              startTransition(() => dispatch());
            }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.formActions}>
        <button
          type="button"
          className={`${styles.button} ${tone === "danger" ? styles.dangerOutline : styles.secondary}`}
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {pending ? "Procesando…" : label}
        </button>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
