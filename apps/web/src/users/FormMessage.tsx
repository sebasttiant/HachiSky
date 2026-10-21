import type { ActionState } from "./action-state.ts";
import styles from "./admin.module.css";

// Errors are announced assertively, confirmations politely.
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={`${styles.alert} ${error ? styles.alertError : styles.alertSuccess}`}
    >
      {state.message}
    </p>
  );
}

export function fieldProps(state: ActionState, name: string) {
  const message = state.fieldErrors?.[name];
  return message
    ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` }
    : {};
}

export function FieldError({
  state,
  name,
}: {
  state: ActionState;
  name: string;
}) {
  const message = state.fieldErrors?.[name];
  return message ? (
    <span id={`${name}-error`} className={styles.fieldError}>
      {message}
    </span>
  ) : null;
}
