"use client";

import {
  IDENTIFICATION_TYPE_LABEL,
  IDENTIFICATION_TYPES,
} from "../clients/validation.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";

export interface SignerFormValues {
  fullName: string;
  identificationType: string;
  identificationNumber: string;
  jobTitle: string;
  email: string;
}

// Shared by "Nuevo firmante" and the edit page. The server validates and
// answers with Spanish field errors; nothing here is trusted.
export function SignerForm({
  action,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  values?: SignerFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="signer-name">Nombre completo</label>
          <input
            id="signer-name"
            name="fullName"
            className={styles.input}
            defaultValue={values?.fullName ?? ""}
            autoComplete="off"
            required
            maxLength={200}
            {...fieldProps(state, "fullName")}
          />
          <FieldError state={state} name="fullName" />
        </div>
        <div className={styles.field}>
          <label htmlFor="signer-job-title">Cargo</label>
          <input
            id="signer-job-title"
            name="jobTitle"
            className={styles.input}
            defaultValue={values?.jobTitle ?? ""}
            autoComplete="off"
            required
            maxLength={100}
            {...fieldProps(state, "jobTitle")}
          />
          <FieldError state={state} name="jobTitle" />
        </div>
        <div className={styles.field}>
          <label htmlFor="signer-id-type">Tipo de identificación</label>
          <select
            id="signer-id-type"
            name="identificationType"
            className={styles.select}
            defaultValue={values?.identificationType ?? "CC"}
            {...fieldProps(state, "identificationType")}
          >
            {IDENTIFICATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {IDENTIFICATION_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <FieldError state={state} name="identificationType" />
        </div>
        <div className={styles.field}>
          <label htmlFor="signer-id-number">Número de identificación</label>
          <input
            id="signer-id-number"
            name="identificationNumber"
            className={styles.input}
            defaultValue={values?.identificationNumber ?? ""}
            autoComplete="off"
            required
            maxLength={30}
            {...fieldProps(state, "identificationNumber")}
          />
          <FieldError state={state} name="identificationNumber" />
        </div>
        <div className={styles.field}>
          <label htmlFor="signer-email">Correo</label>
          <input
            id="signer-email"
            name="email"
            type="email"
            className={styles.input}
            defaultValue={values?.email ?? ""}
            autoComplete="off"
            required
            maxLength={254}
            {...fieldProps(state, "email")}
          />
          <FieldError state={state} name="email" />
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
