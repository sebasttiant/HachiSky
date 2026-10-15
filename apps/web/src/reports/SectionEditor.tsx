"use client";

import { useState } from "react";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { FieldError, FormMessage, fieldProps } from "../users/FormMessage.tsx";
import { useFormAction } from "../users/useFormAction.ts";
import sheet from "./SectionEditor.module.css";
import type { ItemRecord, SectionRecord } from "./service.ts";
import {
  ITEM_FIELDS,
  ITEM_PRIORITY_LABEL,
  ITEM_STATUS_LABEL,
  type SectionKind,
} from "./templates.ts";
import { REPORT_LIMITS } from "./validation.ts";

type Draft = {
  label: string;
  body: string;
  status: string;
  priority: string;
  impact: string;
};

const EMPTY: Draft = {
  label: "",
  body: "",
  status: "",
  priority: "",
  impact: "",
};

function toDraft(item: ItemRecord): Draft {
  return {
    label: item.label,
    body: item.body ?? "",
    status: item.status ?? "",
    priority: item.priority ?? "",
    impact: item.impact ?? "",
  };
}

const ROW_LABEL: Record<SectionKind, { one: string; add: string }> = {
  prose: { one: "Línea", add: "Agregar línea" },
  findings: { one: "Hallazgo", add: "Agregar hallazgo" },
  status_table: { one: "Dominio", add: "Agregar dominio" },
  inventory: { one: "Elemento", add: "Agregar elemento" },
  steps: { one: "Paso", add: "Agregar paso" },
};

// Prose sections are a heading and a body. The rest are repeatable rows, and
// which classifications a row carries comes from the section's kind — the
// service refuses anything else, so the form never offers it.
export function SectionEditor({
  section,
  hint,
  saveSection,
  saveItems,
}: {
  section: SectionRecord;
  hint: string;
  saveSection: (
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  saveItems: (
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
}) {
  const structured = section.kind !== "prose";
  const action = structured ? saveItems : saveSection;
  const { state, pending, onSubmit } = useFormAction(action);
  const [rows, setRows] = useState<Draft[]>(() =>
    section.items.length > 0 ? section.items.map(toDraft) : [EMPTY],
  );
  const allowed = ITEM_FIELDS[section.kind];
  const words = ROW_LABEL[section.kind];

  function update(index: number, field: keyof Draft, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  const filled = section.body !== null || section.items.length > 0;
  // Whether the section is open belongs to the reader, not to the content.
  // Deriving `open` from `filled` on every render closed the section in the
  // author's face the moment they saved it, hiding the confirmation with it:
  // saving refreshes the server data, `filled` flips, and React re-applies
  // the attribute. The content only decides where it starts.
  const [open, setOpen] = useState(!filled);

  return (
    <details
      className={sheet.section}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={sheet.summary}>
        <span className={sheet.heading}>{section.heading}</span>
        <span className={sheet.state}>
          {section.body !== null || section.items.length > 0
            ? "Con contenido"
            : "Vacía"}
        </span>
      </summary>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <input type="hidden" name="key" value={section.key} />
        <p className={sheet.hint}>{hint}</p>

        {structured ? null : (
          <div className={styles.field}>
            <label htmlFor={`heading-${section.key}`}>
              Título de la sección
            </label>
            <input
              id={`heading-${section.key}`}
              name="heading"
              className={styles.input}
              maxLength={REPORT_LIMITS.heading}
              defaultValue={section.heading}
              required
              {...fieldProps(state, "heading")}
            />
            <FieldError state={state} name="heading" />
          </div>
        )}

        {structured ? (
          <>
            <ol className={sheet.rows}>
              {rows.map((row, index) => (
                // The index is the identity here: rows are positional and the
                // whole list is replaced on save.
                // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
                <li key={index} className={sheet.row}>
                  <div className={styles.field}>
                    <label htmlFor={`label-${section.key}-${index}`}>
                      {words.one}
                    </label>
                    <input
                      id={`label-${section.key}-${index}`}
                      name={`items.${index}.label`}
                      className={styles.input}
                      maxLength={REPORT_LIMITS.itemLabel}
                      value={row.label}
                      onChange={(event) =>
                        update(index, "label", event.target.value)
                      }
                      {...fieldProps(state, `items.${index}.label`)}
                    />
                    <FieldError state={state} name={`items.${index}.label`} />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor={`body-${section.key}-${index}`}>
                      Detalle
                    </label>
                    <textarea
                      id={`body-${section.key}-${index}`}
                      name={`items.${index}.body`}
                      className={`${styles.input} ${styles.textarea}`}
                      maxLength={REPORT_LIMITS.itemBody}
                      value={row.body}
                      onChange={(event) =>
                        update(index, "body", event.target.value)
                      }
                      {...fieldProps(state, `items.${index}.body`)}
                    />
                    <FieldError state={state} name={`items.${index}.body`} />
                  </div>

                  {allowed.status ? (
                    <div className={styles.field}>
                      <label htmlFor={`status-${section.key}-${index}`}>
                        Estado
                      </label>
                      <select
                        id={`status-${section.key}-${index}`}
                        name={`items.${index}.status`}
                        className={styles.select}
                        value={row.status}
                        onChange={(event) =>
                          update(index, "status", event.target.value)
                        }
                      >
                        <option value="">Sin estado</option>
                        {Object.entries(ITEM_STATUS_LABEL).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  ) : null}

                  {allowed.priority ? (
                    <div className={styles.field}>
                      <label htmlFor={`priority-${section.key}-${index}`}>
                        Prioridad
                      </label>
                      <select
                        id={`priority-${section.key}-${index}`}
                        name={`items.${index}.priority`}
                        className={styles.select}
                        value={row.priority}
                        onChange={(event) =>
                          update(index, "priority", event.target.value)
                        }
                      >
                        <option value="">Sin prioridad</option>
                        {Object.entries(ITEM_PRIORITY_LABEL).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  ) : null}

                  {allowed.impact ? (
                    <div className={styles.field}>
                      <label htmlFor={`impact-${section.key}-${index}`}>
                        Impacto
                      </label>
                      <input
                        id={`impact-${section.key}-${index}`}
                        name={`items.${index}.impact`}
                        className={styles.input}
                        maxLength={REPORT_LIMITS.impact}
                        value={row.impact}
                        onChange={(event) =>
                          update(index, "impact", event.target.value)
                        }
                        {...fieldProps(state, `items.${index}.impact`)}
                      />
                      <FieldError
                        state={state}
                        name={`items.${index}.impact`}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={`${styles.button} ${styles.secondary}`}
                    onClick={() =>
                      setRows((current) =>
                        current.length === 1
                          ? [EMPTY]
                          : current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => setRows((current) => [...current, EMPTY])}
            >
              {words.add}
            </button>
            <FieldError state={state} name="items" />
          </>
        ) : (
          <div className={styles.field}>
            <label htmlFor={`body-${section.key}`}>Contenido</label>
            <textarea
              id={`body-${section.key}`}
              name="body"
              className={`${styles.input} ${styles.textarea} ${sheet.prose}`}
              maxLength={REPORT_LIMITS.body}
              defaultValue={section.body ?? ""}
              {...fieldProps(state, "body")}
            />
            <FieldError state={state} name="body" />
          </div>
        )}

        <FormMessage state={state} />
        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={pending}
          >
            {pending ? "Guardando…" : "Guardar sección"}
          </button>
        </div>
      </form>
    </details>
  );
}
