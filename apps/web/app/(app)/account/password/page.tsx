import type { Metadata } from "next";
import { changeOwnPasswordAction } from "../../../../src/account/actions.ts";
import { ChangePasswordForm } from "../../../../src/account/ChangePasswordForm.tsx";
import {
  getMustChangePassword,
  requireSession,
} from "../../../../src/auth/guard.ts";
import { safeNextPath } from "../../../../src/auth/next-path.ts";
import { PASSWORD_CHANGED_PARAM } from "../../../../src/auth/password-gate.ts";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession("/account/password");
  const pending = await getMustChangePassword(session.user.id);
  const query = await searchParams;
  const next = safeNextPath(query.next);
  const changed = query[PASSWORD_CHANGED_PARAM] === "1";

  return (
    <div className="container">
      <div className={styles.narrow}>
        <section className={styles.card} aria-labelledby="password-title">
          <h1 id="password-title" className={styles.cardTitle}>
            {pending ? "Crea tu contraseña" : "Cambiar contraseña"}
          </h1>
          {pending ? (
            <p className={`${styles.alert} ${styles.alertInfo} ${styles.lead}`}>
              Entraste con una contraseña temporal que te dio un administrador.
              Antes de continuar, elige una que solo tú conozcas.
            </p>
          ) : changed ? (
            <p
              role="status"
              className={`${styles.alert} ${styles.alertSuccess} ${styles.lead}`}
            >
              Contraseña actualizada. Cerramos tu sesión en los demás equipos.
            </p>
          ) : (
            <p className={styles.cardHint}>
              Al cambiarla cerramos tu sesión en los demás equipos; en este
              sigues conectado.
            </p>
          )}
          <ChangePasswordForm
            key={changed ? "changed" : "form"}
            action={changeOwnPasswordAction}
            next={next}
            mustChange={pending}
          />
        </section>
      </div>
    </div>
  );
}
