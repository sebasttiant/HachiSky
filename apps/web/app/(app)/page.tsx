import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "../../src/auth/guard.ts";
import { visibleModules } from "../../src/auth/permissions.ts";
import { AvailabilityBadge } from "../../src/shell/AvailabilityBadge.tsx";
import { ModuleIcon } from "../../src/shell/icons.tsx";
import {
  SystemStatus,
  SystemStatusFallback,
} from "../../src/system/SystemStatus.tsx";
import styles from "./page.module.css";

// The system status must reflect the database at request time, not at build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user } = await requireModule("home", "/");
  const tiles = visibleModules(user.role).filter((m) => m.id !== "home");
  return (
    <div className="container">
      <header className={styles.header}>
        <h1>Inicio</h1>
        <p>Accede a los módulos de HachiSky y revisa el estado del sistema.</p>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby="modules-title">
          <h2 id="modules-title" className={styles.sectionTitle}>
            Módulos
          </h2>
          <ul className={styles.grid}>
            {tiles.map((module) => (
              <li key={module.id} className={styles.tile}>
                <span className={styles.tileIcon}>
                  <ModuleIcon id={module.id} size={26} />
                </span>
                <div className={styles.tileBody}>
                  <h3>
                    <Link href={module.href} className={styles.tileLink}>
                      {module.label}
                    </Link>
                  </h3>
                  <p>{module.description}</p>
                  <AvailabilityBadge status={module.availability} />
                </div>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Suspense fallback={<SystemStatusFallback />}>
          <SystemStatus />
        </Suspense>
      </div>
    </div>
  );
}
