"use client";

import Link from "next/link";
import {
  IDENTIFICATION_TYPE_LABEL,
  IDENTIFICATION_TYPES,
} from "../clients/validation.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import { NEW_ISSUER_PATH } from "./paths.ts";
import {
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPES,
  CURRENCIES,
  CURRENCY_LABEL,
} from "./validation.ts";

export interface BankAccountFormValues {
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  holderIdentificationType: string;
  holderIdentificationNumber: string;
  currency: string;
  issuerProfileId: string | null;
  issuer: { id: string; legalName: string; active: boolean } | null;
}

export interface IssuerOption {
  id: string;
  legalName: string;
}

// Why the account's current issuer cannot simply be kept (editing only).
function issuerNotice(values: BankAccountFormValues | undefined) {
  if (!values) return null;
  if (!values.issuer) {
    return "Esta cuenta no tiene emisor asignado. Elige el emisor al que pertenece.";
  }
  if (!values.issuer.active) {
    return `El emisor actual (${values.issuer.legalName}) está inactivo. Elige un emisor activo para guardar cambios.`;
  }
  return null;
}

// Shared by "Nueva cuenta" and the edit page. Every account belongs to one
// active issuer, chosen from `issuers` (the active ones). The server
// validates and answers with Spanish field errors; nothing here is trusted.
export function BankAccountForm({
  action,
  issuers,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  issuers: readonly IssuerOption[];
  values?: BankAccountFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const notice = issuerNotice(values);
  // An inactive or missing issuer is never preselected: the admin chooses.
  const selectedIssuer =
    values?.issuer?.active && values.issuerProfileId
      ? values.issuerProfileId
      : "";

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="account-issuer">Emisor</label>
          <select
            id="account-issuer"
            name="issuerProfileId"
            className={styles.select}
            defaultValue={selectedIssuer}
            required
            aria-describedby={
              state.fieldErrors?.issuerProfileId
                ? "issuerProfileId-error"
                : "account-issuer-help"
            }
            aria-invalid={state.fieldErrors?.issuerProfileId ? true : undefined}
          >
            <option value="">Elige un emisor</option>
            {issuers.map((issuer) => (
              <option key={issuer.id} value={issuer.id}>
                {issuer.legalName}
              </option>
            ))}
          </select>
          <span id="account-issuer-help" className={styles.help}>
            {notice ??
              "La cuenta solo se ofrecerá en documentos de este emisor."}
          </span>
          {issuers.length === 0 ? (
            <span className={styles.help}>
              No hay emisores activos.{" "}
              <Link href={NEW_ISSUER_PATH}>Crea un emisor</Link> o reactiva uno
              antes de guardar la cuenta.
            </span>
          ) : null}
          <FieldError state={state} name="issuerProfileId" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-bank">Banco</label>
          <input
            id="account-bank"
            name="bankName"
            className={styles.input}
            defaultValue={values?.bankName ?? ""}
            autoComplete="off"
            required
            maxLength={100}
            {...fieldProps(state, "bankName")}
          />
          <FieldError state={state} name="bankName" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-type">Tipo de cuenta</label>
          <select
            id="account-type"
            name="accountType"
            className={styles.select}
            defaultValue={values?.accountType ?? "ahorros"}
            {...fieldProps(state, "accountType")}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <FieldError state={state} name="accountType" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-number">Número de cuenta</label>
          <input
            id="account-number"
            name="accountNumber"
            className={styles.input}
            defaultValue={values?.accountNumber ?? ""}
            autoComplete="off"
            inputMode="numeric"
            required
            maxLength={30}
            aria-describedby={
              state.fieldErrors?.accountNumber
                ? "accountNumber-error"
                : "account-number-help"
            }
            aria-invalid={state.fieldErrors?.accountNumber ? true : undefined}
          />
          <span id="account-number-help" className={styles.help}>
            Solo números. Puedes separarlos con espacios o guiones; se guarda
            sin ellos.
          </span>
          <FieldError state={state} name="accountNumber" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-currency">Moneda</label>
          <select
            id="account-currency"
            name="currency"
            className={styles.select}
            defaultValue={values?.currency ?? "COP"}
            {...fieldProps(state, "currency")}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABEL[currency]}
              </option>
            ))}
          </select>
          <FieldError state={state} name="currency" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-holder">Titular de la cuenta</label>
          <input
            id="account-holder"
            name="holderName"
            className={styles.input}
            defaultValue={values?.holderName ?? ""}
            autoComplete="off"
            required
            maxLength={200}
            {...fieldProps(state, "holderName")}
          />
          <FieldError state={state} name="holderName" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-holder-id-type">
            Tipo de identificación del titular
          </label>
          <select
            id="account-holder-id-type"
            name="holderIdentificationType"
            className={styles.select}
            defaultValue={values?.holderIdentificationType ?? "NIT"}
            {...fieldProps(state, "holderIdentificationType")}
          >
            {IDENTIFICATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {IDENTIFICATION_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <FieldError state={state} name="holderIdentificationType" />
        </div>
        <div className={styles.field}>
          <label htmlFor="account-holder-id-number">
            Número de identificación del titular
          </label>
          <input
            id="account-holder-id-number"
            name="holderIdentificationNumber"
            className={styles.input}
            defaultValue={values?.holderIdentificationNumber ?? ""}
            autoComplete="off"
            required
            maxLength={30}
            {...fieldProps(state, "holderIdentificationNumber")}
          />
          <FieldError state={state} name="holderIdentificationNumber" />
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
