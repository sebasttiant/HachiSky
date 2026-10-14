"use client";

import Link from "next/link";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUSES,
  type ActivityStatus,
  DESCRIPTION_MAX,
  NEXT_STEPS_MAX,
  OUTCOME_MAX,
  TITLE_MAX,
} from "./validation.ts";

export interface ActivityClientOption {
  id: string;
  label: string;
}

export interface ActivityFormValues {
  clientId: string;
  performedOn: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string;
  description: string | null;
  outcome: string | null;
  status: ActivityStatus;
  nextSteps: string | null;
}

// Shared by new and edit. The service is still the authority: this only keeps
// the form accessible and sends string fields for the same validation path.
export function ActivityForm({
  action,
  clients,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  clients: readonly ActivityClientOption[];
  values?: ActivityFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const missingClients = clients.length === 0;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {missingClients ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          No hay clientes activos.{" "}
          <Link href="/clients/new">Crea un cliente</Link> o reactiva uno antes
          de registrar actividades.
        </p>
      ) : null}
      <div className={styles.formGrid}>
        {missingClients ? null : (
          <div className={styles.field}>
            <label htmlFor="activity-client">Cliente</label>
            <select
              id="activity-client"
              name="clientId"
              className={styles.select}
              defaultValue={values?.clientId ?? ""}
              required
              {...fieldProps(state, "clientId")}
            >
              <option value="">Elige un cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </select>
            <FieldError state={state} name="clientId" />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="activity-date">Fecha</label>
          <input
            id="activity-date"
            name="performedOn"
            type="date"
            className={styles.input}
            defaultValue={values?.performedOn ?? ""}
            required
            {...fieldProps(state, "performedOn")}
          />
          <FieldError state={state} name="performedOn" />
        </div>
        <div className={styles.field}>
          <label htmlFor="activity-start">Hora de inicio (opcional)</label>
          <input
            id="activity-start"
            name="startedAt"
            type="time"
            className={styles.input}
            defaultValue={values?.startedAt ?? ""}
            {...fieldProps(state, "startedAt")}
          />
          <FieldError state={state} name="startedAt" />
        </div>
        <div className={styles.field}>
          <label htmlFor="activity-end">Hora de término (opcional)</label>
          <input
            id="activity-end"
            name="endedAt"
            type="time"
            className={styles.input}
            defaultValue={values?.endedAt ?? ""}
            aria-describedby={
              state.fieldErrors?.endedAt
                ? "endedAt-error"
                : "activity-hours-help"
            }
            aria-invalid={state.fieldErrors?.endedAt ? true : undefined}
          />
          <span id="activity-hours-help" className={styles.help}>
            Si registras horario, indica inicio y término.
          </span>
          <FieldError state={state} name="endedAt" />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="activity-title">Qué se hizo</label>
          <input
            id="activity-title"
            name="title"
            className={styles.input}
            defaultValue={values?.title ?? ""}
            required
            maxLength={TITLE_MAX}
            {...fieldProps(state, "title")}
          />
          <FieldError state={state} name="title" />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="activity-description">Descripción detallada</label>
          <textarea
            id="activity-description"
            name="description"
            className={`${styles.input} ${styles.textarea}`}
            defaultValue={values?.description ?? ""}
            maxLength={DESCRIPTION_MAX}
            {...fieldProps(state, "description")}
          />
          <FieldError state={state} name="description" />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="activity-outcome">Resultado</label>
          <textarea
            id="activity-outcome"
            name="outcome"
            className={`${styles.input} ${styles.textarea}`}
            defaultValue={values?.outcome ?? ""}
            maxLength={OUTCOME_MAX}
            {...fieldProps(state, "outcome")}
          />
          <FieldError state={state} name="outcome" />
        </div>
        <div className={styles.field}>
          <label htmlFor="activity-status">Estado</label>
          <select
            id="activity-status"
            name="status"
            className={styles.select}
            defaultValue={values?.status ?? "completed"}
            {...fieldProps(state, "status")}
          >
            {ACTIVITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ACTIVITY_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <FieldError state={state} name="status" />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="activity-next-steps">
            Pendientes y próximos pasos
          </label>
          <textarea
            id="activity-next-steps"
            name="nextSteps"
            className={`${styles.input} ${styles.textarea}`}
            defaultValue={values?.nextSteps ?? ""}
            maxLength={NEXT_STEPS_MAX}
            {...fieldProps(state, "nextSteps")}
          />
          <FieldError state={state} name="nextSteps" />
        </div>
      </div>
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending || missingClients}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
