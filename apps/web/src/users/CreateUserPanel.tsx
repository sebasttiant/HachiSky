"use client";

import { useState } from "react";
import { createUserAction } from "./actions.ts";
import styles from "./admin.module.css";
import { FieldError, FormMessage, fieldProps } from "./FormMessage.tsx";
import { PasswordField } from "./PasswordField.tsx";
import { ROLE_LABEL } from "./presentation.ts";
import { useFormAction } from "./useFormAction.ts";

// Behind a native <details>: closed, it takes one line and is out of the
// accessibility tree, so the list stays first on a phone. Kept open while the
// server answers with an error.
export function CreateUserPanel() {
  const { state, pending, onSubmit } = useFormAction(createUserAction);
  const [open, setOpen] = useState(false);

  return (
    <details
      className={styles.createPanel}
      open={open || state.status === "error"}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className={styles.plus} aria-hidden="true">
          +
        </span>
        Crear usuario
      </summary>
      <div className={styles.createBody}>
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor="new-name">Nombre completo</label>
              <input
                id="new-name"
                name="name"
                className={styles.input}
                autoComplete="off"
                required
                maxLength={200}
                {...fieldProps(state, "name")}
              />
              <FieldError state={state} name="name" />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-email">Correo</label>
              <input
                id="new-email"
                name="email"
                type="email"
                className={styles.input}
                autoComplete="off"
                placeholder="nombre@empresa.com"
                required
                {...fieldProps(state, "email")}
              />
              <FieldError state={state} name="email" />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-job">Cargo (opcional)</label>
              <input
                id="new-job"
                name="jobTitle"
                className={styles.input}
                autoComplete="off"
                maxLength={100}
                placeholder="Asesor comercial"
                {...fieldProps(state, "jobTitle")}
              />
              <FieldError state={state} name="jobTitle" />
            </div>
            <div className={styles.field}>
              <label htmlFor="new-role">Rol</label>
              <select
                id="new-role"
                name="role"
                className={styles.select}
                defaultValue="staff"
                {...fieldProps(state, "role")}
              >
                <option value="staff">{ROLE_LABEL.staff}</option>
                <option value="admin">{ROLE_LABEL.admin}</option>
              </select>
              <span className={styles.help}>
                Colaborador: Inicio, Clientes, Trabajo e Informes.
                Administrador: además Facturación y Configuración.
              </span>
              <FieldError state={state} name="role" />
            </div>
          </div>
          <PasswordField
            id="new-password"
            label="Contraseña temporal"
            state={state}
          />
          <FormMessage state={state} />
          <div className={styles.formActions}>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={pending}
            >
              {pending ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
