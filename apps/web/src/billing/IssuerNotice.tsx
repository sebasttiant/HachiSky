import { formatDateTime } from "../shared/format/date.ts";
import styles from "../users/admin.module.css";

// Whether the issuer exists is the only thing the page needs to announce;
// the data itself is shown in the form, never repeated here.
export function IssuerNotice({
  issuer,
}: {
  issuer: { updatedAt: Date } | null;
}) {
  return issuer ? (
    <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
      Configurado. Última modificación: {formatDateTime(issuer.updatedAt)}.
    </p>
  ) : (
    <p role="status" className={`${styles.alert} ${styles.alertInfo}`}>
      <strong>Sin configurar.</strong> Completa los datos del emisor para poder
      preparar cuentas de cobro. Mientras tanto no hay ningún dato por defecto.
    </p>
  );
}
