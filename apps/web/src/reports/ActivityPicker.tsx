"use client";

import { formatDate } from "../shared/format/date.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import sheet from "./SectionEditor.module.css";
import type { LinkedActivity } from "./service.ts";

function when(activity: LinkedActivity) {
  const hours =
    activity.startedAt && activity.endedAt
      ? `${activity.startedAt}–${activity.endedAt}`
      : "Sin horario";
  return `${formatDate(activity.performedOn)} · ${hours}`;
}

// The activities a report is built from. They are chosen, never typed: the
// text comes from what was recorded in Trabajo, so the report cannot claim
// work nobody registered.
export function ActivityPicker({
  available,
  selected,
  action,
}: {
  available: readonly LinkedActivity[];
  selected: readonly string[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  if (available.length === 0) {
    return (
      <p className={`${styles.alert} ${styles.alertInfo}`}>
        No hay actividades registradas para este cliente. Regístralas en Trabajo
        y vuelve: un informe describe trabajo que alguien registró.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <p className={sheet.hint}>
        Marca las actividades que este informe describe. El texto sale de lo
        registrado en Trabajo; si corriges una actividad, el informe se corrige
        con ella.
      </p>
      <ul className={sheet.rows}>
        {available.map((activity) => (
          <li key={activity.id} className={sheet.checkRow}>
            <label htmlFor={`activity-${activity.id}`}>
              <input
                id={`activity-${activity.id}`}
                type="checkbox"
                name="activityIds"
                value={activity.id}
                defaultChecked={selected.includes(activity.id)}
              />
              <span>
                <strong>{activity.title}</strong>
                <span className={styles.muted}> · {when(activity)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <FieldError state={state} name="activities" />
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Guardar actividades"}
        </button>
      </div>
    </form>
  );
}
