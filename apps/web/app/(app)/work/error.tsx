"use client";

import styles from "./error.module.css";

// Error boundary for the /work segment: a failure while rendering the workday
// preview keeps the shell (header, navigation) and offers a retry.
export default function WorkError({ reset }: { reset: () => void }) {
  return (
    <div className="container">
      <section className={styles.card} role="alert">
        <h1>No pudimos mostrar el registro de jornada</h1>
        <p>
          Ocurrió un problema al preparar esta vista. Tus datos no se
          modificaron. Intenta de nuevo; si el problema continúa, vuelve al
          inicio.
        </p>
        <button type="button" className={styles.retry} onClick={() => reset()}>
          Intentar de nuevo
        </button>
      </section>
    </div>
  );
}
