import Link from "next/link";
import styles from "./ForbiddenNotice.module.css";

export function ForbiddenNotice() {
  return (
    <div className={styles.stage}>
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
          Tu rol no incluye este módulo. Si lo necesitas para tu trabajo, pídele
          a un administrador de IL Asesorías que revise tus permisos.
        </p>
        <Link href="/" className={styles.action}>
          Volver al inicio
        </Link>
      </section>
    </div>
  );
}
