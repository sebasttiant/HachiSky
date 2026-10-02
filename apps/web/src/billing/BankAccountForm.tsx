"use client";

import {
  IDENTIFICATION_TYPE_LABEL,
  IDENTIFICATION_TYPES,
} from "../clients/validation.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
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
}

// Shared by "Nueva cuenta" and the edit page. The server validates and
// answers with Spanish field errors; nothing here is trusted.
export function BankAccountForm({
  action,
  values,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  values?: BankAccountFormValues;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
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
