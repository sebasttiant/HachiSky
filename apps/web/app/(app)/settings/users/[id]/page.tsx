import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import { ActivityList } from "../../../../../src/users/ActivityList.tsx";
import {
  resetPasswordAction,
  revokeSessionsAction,
  setActiveAction,
  updateUserAction,
} from "../../../../../src/users/actions.ts";
import styles from "../../../../../src/users/admin.module.css";
import {
  PendingPasswordBadge,
  RoleBadge,
  StatusBadge,
  UserAvatar,
} from "../../../../../src/users/Badges.tsx";
import { ConfirmAction } from "../../../../../src/users/ConfirmAction.tsx";
import { EditUserForm } from "../../../../../src/users/EditUserForm.tsx";
import { ResetPasswordForm } from "../../../../../src/users/ResetPasswordForm.tsx";
import { getUser, listAuditForUser } from "../../../../../src/users/service.ts";

export const metadata: Metadata = { title: "Gestionar usuario" };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await requireModule("settings", `/settings/users/${id}`);
  const db = getDb();
  const user = await getUser({ db }, id);
  if (!user) notFound();
  const activity = await listAuditForUser({ db }, id);
  const justCreated = (await searchParams).creado === "1";
  const isSelf = user.id === session.user.id;

  return (
    <div className="container">
      <Link href="/settings/users" className={styles.breadcrumb}>
        ← Usuarios
      </Link>

      <div className={styles.profile}>
        <UserAvatar name={user.name} active={user.active} />
        <div className={styles.identity}>
          <h1>{user.name}</h1>
          <span className={styles.muted}>{user.email}</span>
        </div>
        <div className={styles.badges}>
          <RoleBadge role={user.role} />
          <StatusBadge active={user.active} />
          {user.mustChangePassword ? <PendingPasswordBadge /> : null}
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Cuenta creada. Comparte la contraseña temporal por un canal privado;
          al entrar se le pedirá cambiarla.
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos y rol
            </h2>
            <p className={styles.cardHint}>
              El cargo es descriptivo; el rol define a qué módulos entra.
            </p>
            <EditUserForm
              action={updateUserAction.bind(null, user.id)}
              user={{
                name: user.name,
                jobTitle: user.jobTitle,
                role: user.role,
              }}
              isSelf={isSelf}
            />
          </section>

          <section className={styles.card} aria-labelledby="access-title">
            <h2 id="access-title" className={styles.cardTitle}>
              Acceso
            </h2>
            {isSelf ? (
              <p className={`${styles.alert} ${styles.alertInfo}`}>
                Esta es tu cuenta. Para cambiar tu contraseña o salir usa tu
                menú; desde aquí no puedes desactivarte.
              </p>
            ) : (
              <>
                <div className={styles.actionRow}>
                  <h3>Contraseña temporal</h3>
                  <p className={styles.help}>
                    Reemplaza su contraseña, cierra sus sesiones y le pide
                    cambiarla al entrar.
                  </p>
                  <ResetPasswordForm
                    action={resetPasswordAction.bind(null, user.id)}
                  />
                </div>
                <div className={styles.actionRow}>
                  <h3>Sesiones abiertas</h3>
                  <p className={styles.help}>
                    Útil si perdió un equipo o dejó la sesión abierta en otro
                    computador.
                  </p>
                  <ConfirmAction
                    action={revokeSessionsAction.bind(null, user.id)}
                    label="Cerrar todas sus sesiones"
                    confirmLabel="Sí, cerrar sesiones"
                    warning={`${user.name} tendrá que volver a iniciar sesión en todos sus equipos.`}
                    tone="primary"
                  />
                </div>
                <div className={styles.actionRow}>
                  <h3>Estado de la cuenta</h3>
                  {user.active ? (
                    <ConfirmAction
                      action={setActiveAction.bind(null, user.id, false)}
                      label="Desactivar cuenta"
                      confirmLabel="Sí, desactivar"
                      warning={`${user.name} perderá el acceso de inmediato y se cerrarán sus sesiones. Su historial se conserva y puedes reactivarla después.`}
                    />
                  ) : (
                    <ConfirmAction
                      action={setActiveAction.bind(null, user.id, true)}
                      label="Reactivar cuenta"
                      confirmLabel="Sí, reactivar"
                      warning={`${user.name} podrá volver a iniciar sesión con su contraseña actual.`}
                      tone="primary"
                    />
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Creado</dt>
                <dd>{formatDateTime(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Última actividad</dt>
                <dd>
                  {user.lastSeenAt ? formatDateTime(user.lastSeenAt) : "Nunca"}
                </dd>
              </div>
            </dl>
          </section>
          <section className={styles.card} aria-labelledby="activity-title">
            <h2 id="activity-title" className={styles.cardTitle}>
              Actividad reciente
            </h2>
            <ActivityList items={activity} />
          </section>
        </div>
      </div>
    </div>
  );
}
