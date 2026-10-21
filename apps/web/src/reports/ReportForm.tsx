"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import sheet from "./SectionEditor.module.css";
import {
  REPORT_TYPE_DESCRIPTION,
  REPORT_TYPE_LABEL,
  REPORT_TYPES,
  type ReportType,
} from "./templates.ts";
import { REPORT_LIMITS } from "./validation.ts";

export interface ReportClientOption {
  id: string;
  label: string;
}

export interface ReportIdentityOption {
  id: string;
  label: string;
}

export interface ReportFormValues {
  type: ReportType;
  clientId: string;
  periodStart: string | null;
  periodEnd: string | null;
  title: string;
  issuerProfileId: string | null;
  signerProfileId: string | null;
  detailLevel: "detailed" | "summary";
}

// Shared by new and edit. On edit the type is fixed: it decided which
// sections exist, so changing it would orphan what the author already wrote.
export function ReportForm({
  action,
  clients,
  providers,
  signers,
  values,
  lockType,
  submitLabel,
  pendingLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  clients: readonly ReportClientOption[];
  providers: readonly ReportIdentityOption[];
  signers: readonly ReportIdentityOption[];
  values?: ReportFormValues;
  lockType?: boolean;
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const missingClients = clients.length === 0;
  // The detail level only exists for follow_up, so it follows the type.
  const [type, setType] = useState<string>(values?.type ?? "");

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {missingClients ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          No hay clientes activos.{" "}
          <Link href="/clients/new">Crea un cliente</Link> o reactiva uno antes
          de escribir informes.
        </p>
      ) : null}
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="report-type">Tipo de informe</label>
          {lockType && values ? (
            <>
              <input type="hidden" name="type" value={values.type} />
              <p className={sheet.staticValue}>
                {REPORT_TYPE_LABEL[values.type]}
              </p>
              <span className={styles.help}>
                El tipo no se cambia: es lo que definió las secciones de este
                informe.
              </span>
            </>
          ) : (
            <>
              <select
                id="report-type"
                name="type"
                className={styles.select}
                defaultValue={values?.type ?? ""}
                required
                onChange={(event) => setType(event.target.value)}
                {...fieldProps(state, "type")}
              >
                <option value="">Elige un tipo</option>
                {REPORT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {REPORT_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
              <span className={styles.help}>
                Cada tipo trae sus propias secciones.
              </span>
            </>
          )}
          <FieldError state={state} name="type" />
        </div>

        {missingClients ? null : (
          <div className={styles.field}>
            <label htmlFor="report-client">Cliente</label>
            <select
              id="report-client"
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
          <label htmlFor="report-start">Inicio del período (opcional)</label>
          <input
            id="report-start"
            name="periodStart"
            type="date"
            className={styles.input}
            defaultValue={values?.periodStart ?? ""}
            {...fieldProps(state, "periodStart")}
          />
          <FieldError state={state} name="periodStart" />
        </div>
        <div className={styles.field}>
          <label htmlFor="report-end">Fin del período (opcional)</label>
          <input
            id="report-end"
            name="periodEnd"
            type="date"
            className={styles.input}
            defaultValue={values?.periodEnd ?? ""}
            {...fieldProps(state, "periodEnd")}
          />
          <span className={styles.help}>
            Un diagnóstico puede no tener período.
          </span>
          <FieldError state={state} name="periodEnd" />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="report-title">Título</label>
        <input
          id="report-title"
          name="title"
          className={styles.input}
          maxLength={REPORT_LIMITS.title}
          defaultValue={values?.title ?? ""}
          required
          {...fieldProps(state, "title")}
        />
        <FieldError state={state} name="title" />
      </div>

      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="report-provider">Proveedor que emite</label>
          <select
            id="report-provider"
            name="issuerProfileId"
            className={styles.select}
            defaultValue={values?.issuerProfileId ?? ""}
            {...fieldProps(state, "issuerProfileId")}
          >
            <option value="">Sin definir todavía</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          <span className={styles.help}>
            El documento sale con el logo de este proveedor. Para emitir el
            informe es obligatorio elegirlo.
          </span>
          <FieldError state={state} name="issuerProfileId" />
        </div>

        <div className={styles.field}>
          <label htmlFor="report-signer">Firmante</label>
          <select
            id="report-signer"
            name="signerProfileId"
            className={styles.select}
            defaultValue={values?.signerProfileId ?? ""}
            {...fieldProps(state, "signerProfileId")}
          >
            <option value="">Sin definir todavía</option>
            {signers.map((signer) => (
              <option key={signer.id} value={signer.id}>
                {signer.label}
              </option>
            ))}
          </select>
          <span className={styles.help}>
            Su firma y sus datos cierran el documento. También es obligatorio
            para emitir.
          </span>
          <FieldError state={state} name="signerProfileId" />
        </div>

        {type === "follow_up" ? (
          <div className={styles.field}>
            <label htmlFor="report-detail">Nivel de detalle</label>
            <select
              id="report-detail"
              name="detailLevel"
              className={styles.select}
              defaultValue={values?.detailLevel ?? "detailed"}
              {...fieldProps(state, "detailLevel")}
            >
              <option value="detailed">
                Detallado: actividades con fecha, hora y horas
              </option>
              <option value="summary">
                Solo datos: sin detalle de actividades ni horas
              </option>
            </select>
            <FieldError state={state} name="detailLevel" />
          </div>
        ) : (
          <input
            type="hidden"
            name="detailLevel"
            value={values?.detailLevel ?? "detailed"}
          />
        )}
      </div>

      {lockType ? null : (
        <ul className={sheet.hintList}>
          {REPORT_TYPES.map((type) => (
            <li key={type}>
              <strong>{REPORT_TYPE_LABEL[type]}:</strong>{" "}
              {REPORT_TYPE_DESCRIPTION[type]}
            </li>
          ))}
        </ul>
      )}

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
