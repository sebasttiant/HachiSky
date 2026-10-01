import type { Metadata } from "next";
import Link from "next/link";
import { AppFooter } from "../src/shell/AppFooter.tsx";
import headerStyles from "../src/shell/AppHeader.module.css";
import { Wordmark } from "../src/shell/Wordmark.tsx";
import styles from "./forbidden.module.css";

export const metadata: Metadata = { title: "Sin acceso" };

// Rendered by forbidden() (src/auth/guard.ts) with HTTP 403.
export default function Forbidden() {
  return (
    <>
      <header className={headerStyles.header}>
        <div className={`container ${headerStyles.bar}`}>
          <Link href="/" className={headerStyles.brand}>
            {/* biome-ignore lint/performance/noImgElement: tiny static derivatives, no optimizer */}
            <img
              className={headerStyles.mark}
              src="/brand/hachisky-mark-96.png"
              srcSet="/brand/hachisky-mark-96.png 96w, /brand/hachisky-mark-144.png 144w"
              sizes="48px"
              alt=""
              width={48}
              height={47}
            />
            <Wordmark />
          </Link>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className={styles.main}>
        <section className={styles.card} aria-labelledby="forbidden-heading">
          <span className={styles.icon}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <rect
                x="5"
                y="10.5"
                width="14"
                height="9.5"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <h1 id="forbidden-heading">No tienes acceso a esta sección</h1>
          <p>
            Tu rol no incluye este módulo. Si lo necesitas para tu trabajo,
            pídele a un administrador de IL Asesorías que revise tus permisos.
          </p>
          <Link href="/" className={styles.action}>
            Volver al inicio
          </Link>
        </section>
      </main>

      <AppFooter />
    </>
  );
}
