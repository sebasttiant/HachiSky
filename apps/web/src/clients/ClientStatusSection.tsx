import type { RoleName } from "../auth/session.ts";
import type { ActionState } from "../users/action-state.ts";
import styles from "../users/admin.module.css";
import { ConfirmAction } from "../users/ConfirmAction.tsx";
import { canPerformClientOperation } from "./permissions.ts";

// Deactivate and reactivate are admin only (see permissions.ts). The buttons
// are hidden for staff as presentation; the Server Function and the service
// refuse the operation regardless of what is rendered.
export function ClientStatusSection({
  role,
  active,
  name,
  deactivate,
  reactivate,
}: {
  role: RoleName;
  active: boolean;
  name: string;
  deactivate: (previous: ActionState) => Promise<ActionState>;
  reactivate: (previous: ActionState) => Promise<ActionState>;
}) {
  const allowed = canPerformClientOperation(
    role,
    active ? "deactivate" : "reactivate",
  );
  return (
    <section className={styles.card} aria-labelledby="status-title">
      <h2 id="status-title" className={styles.cardTitle}>
        Estado del cliente
      </h2>
      <p className={styles.cardHint}>
        Los clientes no se borran: se desactivan y su información se conserva.
      </p>
      {!allowed ? (
        <p className={`${styles.alert} ${styles.alertInfo}`}>
          Solo un administrador puede {active ? "desactivar" : "reactivar"}{" "}
          clientes.
        </p>
      ) : active ? (
        <ConfirmAction
          action={deactivate}
          label="Desactivar cliente"
          confirmLabel="Sí, desactivar"
          warning={`${name} dejará de aparecer en la lista de clientes activos. Su información se conserva y puedes reactivarlo después.`}
        />
      ) : (
        <ConfirmAction
          action={reactivate}
          label="Reactivar cliente"
          confirmLabel="Sí, reactivar"
          warning={`${name} volverá a la lista de clientes activos.`}
          tone="primary"
        />
      )}
    </section>
  );
}
