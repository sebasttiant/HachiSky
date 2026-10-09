"use client";

import { useState } from "react";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import type { DraftOption, DraftOptions, DraftRecord } from "./drafts.ts";
import { formatAmount, formatAmountInput, parseAmount } from "./money.ts";
import {
  CURRENCIES,
  CURRENCY_LABEL,
  type Currency,
  DRAFT_LINES_MAX,
  isCurrency,
  LINE_DESCRIPTION_MAX,
  LINE_PRODUCT_MAX,
  LINE_QUANTITY_MAX,
  PAYMENT_TERMS_MAX,
} from "./validation.ts";

interface Row {
  key: number;
  product: string;
  description: string;
  quantity: string;
  amount: string;
}

type RowField = Exclude<keyof Row, "key">;

const AMOUNT_EXAMPLE: Record<Currency, string> = {
  COP: "Pesos sin decimales, por ejemplo 1.234.567.",
  USD: "Dólares con coma para los decimales, por ejemplo 1.234,56.",
};

function optionLabel(option: DraftOption): string {
  return option.active ? option.label : `${option.label} (inactivo)`;
}

function initialRows(draft: DraftRecord): Row[] {
  if (draft.lines.length === 0) {
    return [{ key: 0, product: "", description: "", quantity: "", amount: "" }];
  }
  return draft.lines.map((line, index) => ({
    key: index,
    product: line.product,
    description: line.description ?? "",
    quantity: line.quantity ?? "",
    amount: formatAmountInput(line.amountMinor, draft.currency),
  }));
}

// Shown while typing only; the server reads and checks every amount again.
function previewTotal(rows: readonly Row[], currency: Currency) {
  let total = 0;
  let unreadable = false;
  for (const row of rows) {
    if (row.amount.trim() === "") continue;
    const amount = parseAmount(row.amount, currency);
    if (amount.ok) total += amount.minor;
    else unreadable = true;
  }
  return { total, unreadable };
}

// The whole draft is saved at once: header and lines. Line fields are sent as
// `lines.<row>.<field>`, and the server answers errors with the same names.
export function DraftEditor({
  action,
  draft,
  options,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  draft: DraftRecord;
  options: DraftOptions;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const [issuerId, setIssuerId] = useState(draft.issuerProfileId);
  const [currency, setCurrency] = useState<Currency>(draft.currency);
  const [bankAccountId, setBankAccountId] = useState(draft.bankAccountId ?? "");
  const [rows, setRows] = useState<Row[]>(() => initialRows(draft));
  const [nextKey, setNextKey] = useState(rows.length);

  // Only accounts of the chosen issuer in the chosen currency can be used.
  const accounts = options.bankAccounts.filter(
    (account) =>
      account.issuerProfileId === issuerId && account.currency === currency,
  );
  function choose(nextIssuer: string, nextCurrency: Currency) {
    setIssuerId(nextIssuer);
    setCurrency(nextCurrency);
    const stillValid = options.bankAccounts.some(
      (account) =>
        account.id === bankAccountId &&
        account.issuerProfileId === nextIssuer &&
        account.currency === nextCurrency,
    );
    if (!stillValid) setBankAccountId("");
  }

  function updateRow(key: number, field: RowField, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, [field]: value } : row,
      ),
    );
  }
  function addRow() {
    setRows((current) => [
      ...current,
      { key: nextKey, product: "", description: "", quantity: "", amount: "" },
    ]);
    setNextKey((key) => key + 1);
  }
  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  const { total, unreadable } = previewTotal(rows, currency);

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <section className={styles.card} aria-labelledby="header-title">
        <h2 id="header-title" className={styles.cardTitle}>
          Datos de la cuenta de cobro
        </h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="draft-client">Cliente</label>
            <select
              id="draft-client"
              name="clientId"
              className={styles.select}
              defaultValue={draft.clientId}
              {...fieldProps(state, "clientId")}
            >
              {options.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {optionLabel(client)}
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
              value={issuerId}
              onChange={(event) => choose(event.target.value, currency)}
              {...fieldProps(state, "issuerProfileId")}
            >
              {options.issuers.map((issuer) => (
                <option key={issuer.id} value={issuer.id}>
                  {optionLabel(issuer)}
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
              value={currency}
              onChange={(event) => {
                if (isCurrency(event.target.value))
                  choose(issuerId, event.target.value);
              }}
              {...fieldProps(state, "currency")}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_LABEL[code]}
                </option>
              ))}
            </select>
            <FieldError state={state} name="currency" />
          </div>
          <div className={styles.field}>
            <label htmlFor="draft-bank-account">Cuenta bancaria</label>
            <select
              id="draft-bank-account"
              name="bankAccountId"
              className={styles.select}
              value={bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
              {...fieldProps(state, "bankAccountId")}
            >
              <option value="">Sin cuenta todavía</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {optionLabel(account)}
                </option>
              ))}
            </select>
            <span className={styles.help}>
              Solo cuentas del emisor elegido en la moneda del documento.
            </span>
            <FieldError state={state} name="bankAccountId" />
          </div>
          <div className={styles.field}>
            <label htmlFor="draft-signer">Firmante</label>
            <select
              id="draft-signer"
              name="signerProfileId"
              className={styles.select}
              defaultValue={draft.signerProfileId ?? ""}
              {...fieldProps(state, "signerProfileId")}
            >
              <option value="">Sin firmante todavía</option>
              {options.signers.map((signer) => (
                <option key={signer.id} value={signer.id}>
                  {optionLabel(signer)}
                </option>
              ))}
            </select>
            <FieldError state={state} name="signerProfileId" />
          </div>
          <div className={styles.field}>
            <label htmlFor="draft-declaration">Declaración (opcional)</label>
            <select
              id="draft-declaration"
              name="declarationTextId"
              className={styles.select}
              defaultValue={draft.declarationTextId ?? ""}
              {...fieldProps(state, "declarationTextId")}
            >
              <option value="">Sin declaración</option>
              {options.declarations.map((declaration) => (
                <option key={declaration.id} value={declaration.id}>
                  {optionLabel(declaration)}
                </option>
              ))}
            </select>
            <FieldError state={state} name="declarationTextId" />
          </div>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="draft-terms">Condiciones de pago</label>
            <textarea
              id="draft-terms"
              name="paymentTerms"
              className={`${styles.input} ${styles.textarea}`}
              defaultValue={draft.paymentTerms ?? ""}
              maxLength={PAYMENT_TERMS_MAX}
              {...fieldProps(state, "paymentTerms")}
            />
            <FieldError state={state} name="paymentTerms" />
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="lines-title">
        <h2 id="lines-title" className={styles.cardTitle}>
          Líneas
        </h2>
        <p className={styles.cardHint}>
          Escribe el valor total de cada línea. La cantidad es informativa: no
          multiplica el valor. {AMOUNT_EXAMPLE[currency]}
        </p>
        <FieldError state={state} name="lines" />
        <div className={styles.stack}>
          {rows.map((row, index) => {
            const name = (field: RowField) => `lines.${index}.${field}`;
            return (
              <fieldset key={row.key} className={styles.card}>
                <legend>Línea {index + 1}</legend>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label htmlFor={`line-${row.key}-product`}>Producto</label>
                    <input
                      id={`line-${row.key}-product`}
                      name={name("product")}
                      className={styles.input}
                      value={row.product}
                      onChange={(event) =>
                        updateRow(row.key, "product", event.target.value)
                      }
                      autoComplete="off"
                      maxLength={LINE_PRODUCT_MAX}
                      {...fieldProps(state, name("product"))}
                    />
                    <FieldError state={state} name={name("product")} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`line-${row.key}-quantity`}>
                      Cantidad (opcional)
                    </label>
                    <input
                      id={`line-${row.key}-quantity`}
                      name={name("quantity")}
                      className={styles.input}
                      value={row.quantity}
                      onChange={(event) =>
                        updateRow(row.key, "quantity", event.target.value)
                      }
                      autoComplete="off"
                      maxLength={LINE_QUANTITY_MAX}
                      {...fieldProps(state, name("quantity"))}
                    />
                    <FieldError state={state} name={name("quantity")} />
                  </div>
                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <label htmlFor={`line-${row.key}-description`}>
                      Descripción (opcional)
                    </label>
                    <textarea
                      id={`line-${row.key}-description`}
                      name={name("description")}
                      className={`${styles.input} ${styles.textarea}`}
                      value={row.description}
                      onChange={(event) =>
                        updateRow(row.key, "description", event.target.value)
                      }
                      maxLength={LINE_DESCRIPTION_MAX}
                      {...fieldProps(state, name("description"))}
                    />
                    <FieldError state={state} name={name("description")} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`line-${row.key}-amount`}>
                      Precio total ({currency})
                    </label>
                    <input
                      id={`line-${row.key}-amount`}
                      name={name("amount")}
                      className={styles.input}
                      value={row.amount}
                      onChange={(event) =>
                        updateRow(row.key, "amount", event.target.value)
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      {...fieldProps(state, name("amount"))}
                    />
                    <FieldError state={state} name={name("amount")} />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.secondary}`}
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    aria-label={`Quitar la línea ${index + 1}`}
                  >
                    Quitar línea
                  </button>
                </div>
              </fieldset>
            );
          })}
        </div>
        <div className={styles.formActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={addRow}
            disabled={rows.length >= DRAFT_LINES_MAX}
          >
            Agregar línea
          </button>
        </div>
        <p aria-live="polite">
          Total: <strong>{formatAmount(total, currency)}</strong>
          {unreadable ? " (sin contar los valores que no se pueden leer)" : ""}
        </p>
      </section>

      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </form>
  );
}
