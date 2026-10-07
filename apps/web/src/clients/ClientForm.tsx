"use client";

import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import {
  IDENTIFICATION_TYPE_LABEL,
  IDENTIFICATION_TYPES,
} from "./validation.ts";

export interface ClientFormValues {
  name: string;
  identificationType: string;
  identificationNumber: string;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
}

// Shared by "Nuevo cliente" and the edit page. The server validates and
// answers with Spanish field errors; nothing here is trusted.
export function ClientForm({
  action,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ClientFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="client-name">Nombre o razón social</label>
          <input
            id="client-name"
            name="name"
            className={styles.input}
            defaultValue={values?.name ?? ""}
            autoComplete="off"
            required
            maxLength={200}
            {...fieldProps(state, "name")}
          />
          <FieldError state={state} name="name" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-id-type">Tipo de identificación</label>
          <select
            id="client-id-type"
            name="identificationType"
            className={styles.select}
            defaultValue={values?.identificationType ?? "NIT"}
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
          <label htmlFor="client-id-number">Número de identificación</label>
          <input
            id="client-id-number"
            name="identificationNumber"
            className={styles.input}
            defaultValue={values?.identificationNumber ?? ""}
            autoComplete="off"
            inputMode="text"
            required
            maxLength={30}
            aria-describedby={
              state.fieldErrors?.identificationNumber
                ? "identificationNumber-error"
                : "client-id-number-help"
            }
            aria-invalid={
              state.fieldErrors?.identificationNumber ? true : undefined
            }
          />
          <span id="client-id-number-help" className={styles.help}>
            Puedes escribirlo con puntos o guion; se guarda sin ellos.
          </span>
          <FieldError state={state} name="identificationNumber" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-address">Dirección (opcional)</label>
          <input
            id="client-address"
            name="address"
            className={styles.input}
            defaultValue={values?.address ?? ""}
            autoComplete="off"
            maxLength={200}
            {...fieldProps(state, "address")}
          />
          <FieldError state={state} name="address" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-city">Ciudad (opcional)</label>
          <input
            id="client-city"
            name="city"
            className={styles.input}
            defaultValue={values?.city ?? ""}
            autoComplete="off"
            maxLength={100}
            {...fieldProps(state, "city")}
          />
          <FieldError state={state} name="city" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-email">Correo de contacto (opcional)</label>
          <input
            id="client-email"
            name="email"
            type="email"
            className={styles.input}
            defaultValue={values?.email ?? ""}
            autoComplete="off"
            maxLength={254}
            {...fieldProps(state, "email")}
          />
          <FieldError state={state} name="email" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-phone">Teléfono de contacto (opcional)</label>
          <input
            id="client-phone"
            name="phone"
            type="tel"
            className={styles.input}
            defaultValue={values?.phone ?? ""}
            autoComplete="off"
            maxLength={30}
            {...fieldProps(state, "phone")}
          />
          <FieldError state={state} name="phone" />
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
