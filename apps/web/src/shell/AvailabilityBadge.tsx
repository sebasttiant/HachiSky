import styles from "./AvailabilityBadge.module.css";
import { AVAILABILITY_LABEL, type Availability } from "./navigation.ts";

export function AvailabilityBadge({ status }: { status: Availability }) {
  return (
    <span className={`${styles.pill} ${styles[status]}`}>
      {AVAILABILITY_LABEL[status]}
    </span>
  );
}
