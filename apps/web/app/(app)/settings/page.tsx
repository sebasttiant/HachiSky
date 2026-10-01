import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../src/auth/guard.ts";
import { getDb } from "../../../src/db/client.ts";
import { ModuleIcon } from "../../../src/shell/icons.tsx";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "../../../src/users/admin.module.css";
import { countUsers } from "../../../src/users/service.ts";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  await requireModule("settings", "/settings");
  const counts = await countUsers({ db: getDb() });
  return (
    <div className="container">
      <PageHeader
        moduleId="settings"
        title="Configuración"
        description="Administra quién usa HachiSky, qué puede hacer y revisa lo que ha cambiado."
      />
      <ul className={styles.hubGrid}>
        <li className={styles.hubTile}>
          <span className={styles.hubIcon}>
            <ModuleIcon id="clients" size={24} />
          </span>
          <h2>
            <Link href="/settings/users" className={styles.hubLink}>
              Usuarios
            </Link>
          </h2>
          <p>
            Crea cuentas, asigna roles, restablece contraseñas y desactiva
            accesos.
          </p>
          <span className={styles.hubStat}>
            {counts.active} {counts.active === 1 ? "activo" : "activos"}
          </span>
          {counts.inactive > 0 || counts.mustChangePassword > 0 ? (
            <span className={styles.muted}>
              {counts.inactive} inactivos · {counts.mustChangePassword} con
              contraseña temporal
            </span>
          ) : null}
        </li>
        <li className={styles.hubTile}>
          <span className={styles.hubIcon}>
            <ModuleIcon id="reports" size={24} />
          </span>
          <h2>
            <Link href="/settings/activity" className={styles.hubLink}>
              Actividad
            </Link>
          </h2>
          <p>
            Quién hizo qué y cuándo: altas, cambios de rol, desactivaciones y
            contraseñas.
          </p>
        </li>
      </ul>
    </div>
  );
}
