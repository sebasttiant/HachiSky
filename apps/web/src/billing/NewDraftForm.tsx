"use client";

import Link from "next/link";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import type { DraftOptions } from "./drafts.ts";
import { NEW_ISSUER_PATH } from "./paths.ts";
import { CURRENCIES, CURRENCY_LABEL } from "./validation.ts";

// Starting a draft needs only who it is for, who issues it and the currency.
// Everything else is filled in the draft editor.
export function NewDraftForm({
  action,
  options,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  options: Pick<DraftOptions, "clients" | "issuers">;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const defaultIssuer =
    options.issuers.find((issuer) => issuer.isDefault) ?? options.issuers[0];
  const missing = options.clients.length === 0 || options.issuers.length === 0;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {options.clients.length === 0 ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          Todavía no hay clientes activos.{" "}
          <Link href="/clients/new">Crea un cliente</Link> para poder hacerle
          una cuenta de cobro.
        </p>
      ) : null}
      {options.issuers.length === 0 ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          Todavía no hay emisores activos.{" "}
          <Link href={NEW_ISSUER_PATH}>Configura un emisor</Link> antes de
          empezar.
        </p>
      ) : null}
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="draft-client">Cliente</label>
          <select
            id="draft-client"
            name="clientId"
            className={styles.select}
            defaultValue=""
            {...fieldProps(state, "clientId")}
          >
            <option value="">Elige un cliente</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </select>
          <FieldError state={state} name="clientId" />
        </div>
        <div className={styles.field}>
          <label htmlFor="draft-issuer">Emisor</label>
          <select
            id="draft-issuer"
            name="issuerProfileId"
            className={styles.select}
            defaultValue={defaultIssuer?.id ?? ""}
            {...fieldProps(state, "issuerProfileId")}
          >
            {options.issuers.map((issuer) => (
              <option key={issuer.id} value={issuer.id}>
                {issuer.label}
              </option>
            ))}
          </select>
          <FieldError state={state} name="issuerProfileId" />
        </div>
        <div className={styles.field}>
          <label htmlFor="draft-currency">Moneda</label>
          <select
            id="draft-currency"
            name="currency"
            className={styles.select}
            defaultValue="COP"
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
      </div>
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending || missing}
        >
          {pending ? "Creando…" : "Crear borrador"}
        </button>
      </div>
    </form>
  );
}
