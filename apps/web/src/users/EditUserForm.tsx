"use client";

import type { ActionState } from "./action-state.ts";
import styles from "./admin.module.css";
import { FieldError, FormMessage, fieldProps } from "./FormMessage.tsx";
import { ROLE_LABEL } from "./presentation.ts";
import { useFormAction } from "./useFormAction.ts";

export function EditUserForm({
  action,
  user,
  isSelf,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  user: { name: string; jobTitle: string | null; role: string | null };
  isSelf: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const role = user.role === "admin" ? "admin" : "staff";

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="edit-name">Nombre completo</label>
          <input
            id="edit-name"
            name="name"
            className={styles.input}
            defaultValue={user.name}
            required
            maxLength={200}
            {...fieldProps(state, "name")}
          />
          <FieldError state={state} name="name" />
        </div>
        <div className={styles.field}>
          <label htmlFor="edit-job">Cargo</label>
          <input
            id="edit-job"
            name="jobTitle"
            className={styles.input}
            defaultValue={user.jobTitle ?? ""}
            maxLength={100}
            {...fieldProps(state, "jobTitle")}
          />
          <FieldError state={state} name="jobTitle" />
        </div>
        <div className={styles.field}>
          <label htmlFor="edit-role">Rol</label>
          {/* A disabled select is not submitted; the hidden input carries
              the unchanged role for the admin's own account. */}
          {isSelf ? <input type="hidden" name="role" value={role} /> : null}
          <select
            id="edit-role"
            name={isSelf ? undefined : "role"}
            className={styles.select}
            defaultValue={role}
            disabled={isSelf}
            aria-describedby={isSelf ? "edit-role-help" : undefined}
            {...fieldProps(state, "role")}
          >
            <option value="staff">{ROLE_LABEL.staff}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </select>
          {isSelf ? (
            <span id="edit-role-help" className={styles.help}>
              No puedes cambiar tu propio rol.
            </span>
          ) : null}
          <FieldError state={state} name="role" />
        </div>
      </div>
      <FormMessage state={state} />
      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
