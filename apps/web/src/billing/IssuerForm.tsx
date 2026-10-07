"use client";

import {
  IDENTIFICATION_TYPE_LABEL,
  IDENTIFICATION_TYPES,
} from "../clients/validation.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import { PAYMENT_TERMS_MAX } from "./validation.ts";

export interface IssuerFormValues {
  legalName: string;
  identificationType: string;
  identificationNumber: string;
  address: string;
  city: string;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
}

// Identity and default payment terms of one issuer profile, shared by
// "Nuevo emisor" and the edit page (administrators only). The server
// validates and answers with Spanish field errors; nothing here is trusted.
export function IssuerForm({
  action,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  values?: IssuerFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="issuer-name">Nombre o razón social</label>
          <input
            id="issuer-name"
            name="legalName"
            className={styles.input}
            defaultValue={values?.legalName ?? ""}
            autoComplete="off"
            required
            maxLength={200}
            {...fieldProps(state, "legalName")}
          />
          <FieldError state={state} name="legalName" />
        </div>
        <div className={styles.field}>
          <label htmlFor="issuer-id-type">Tipo de identificación</label>
          <select
            id="issuer-id-type"
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
          <label htmlFor="issuer-id-number">Número de identificación</label>
          <input
            id="issuer-id-number"
            name="identificationNumber"
            className={styles.input}
            defaultValue={values?.identificationNumber ?? ""}
            autoComplete="off"
            required
            maxLength={30}
            aria-describedby={
              state.fieldErrors?.identificationNumber
                ? "identificationNumber-error"
                : "issuer-id-number-help"
            }
            aria-invalid={
              state.fieldErrors?.identificationNumber ? true : undefined
            }
          />
          <span id="issuer-id-number-help" className={styles.help}>
            Puedes escribirlo con puntos o guion; se guarda sin ellos.
          </span>
          <FieldError state={state} name="identificationNumber" />
        </div>
        <div className={styles.field}>
          <label htmlFor="issuer-address">Dirección</label>
          <input
            id="issuer-address"
            name="address"
            className={styles.input}
            defaultValue={values?.address ?? ""}
            autoComplete="off"
            required
            maxLength={200}
            {...fieldProps(state, "address")}
          />
          <FieldError state={state} name="address" />
        </div>
        <div className={styles.field}>
          <label htmlFor="issuer-city">Ciudad</label>
          <input
            id="issuer-city"
            name="city"
            className={styles.input}
            defaultValue={values?.city ?? ""}
            autoComplete="off"
            required
            maxLength={100}
            {...fieldProps(state, "city")}
          />
          <FieldError state={state} name="city" />
        </div>
        <div className={styles.field}>
          <label htmlFor="issuer-phone">Teléfono (opcional)</label>
          <input
            id="issuer-phone"
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
        <div className={styles.field}>
          <label htmlFor="issuer-email">Correo (opcional)</label>
          <input
            id="issuer-email"
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
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="issuer-terms">
            Condiciones de pago por defecto (opcional)
          </label>
          <textarea
            id="issuer-terms"
            name="paymentTerms"
            className={`${styles.input} ${styles.textarea}`}
            defaultValue={values?.paymentTerms ?? ""}
            maxLength={PAYMENT_TERMS_MAX}
            aria-describedby={
              state.fieldErrors?.paymentTerms
                ? "paymentTerms-error"
                : "issuer-terms-help"
            }
            aria-invalid={state.fieldErrors?.paymentTerms ? true : undefined}
          />
          <span id="issuer-terms-help" className={styles.help}>
            Este texto se propone en cada cuenta de cobro nueva y se puede
            ajustar mientras sea borrador. Máximo {PAYMENT_TERMS_MAX}{" "}
            caracteres.
          </span>
          <FieldError state={state} name="paymentTerms" />
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
