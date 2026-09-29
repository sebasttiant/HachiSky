import type { ReactNode } from "react";
import { AvailabilityBadge } from "./AvailabilityBadge.tsx";
import { ModuleIcon } from "./icons.tsx";
import { MODULES, type ModuleId } from "./navigation.ts";
import styles from "./PageHeader.module.css";

export function PageHeader({
  moduleId,
  title,
  description,
  actions,
}: {
  moduleId: ModuleId;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const module = MODULES.find((m) => m.id === moduleId);
  return (
    <div className={styles.header}>
      <span className={styles.icon}>
        <ModuleIcon id={moduleId} size={28} />
      </span>
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <h1>{title}</h1>
          {module ? <AvailabilityBadge status={module.availability} /> : null}
        </div>
        <p>{description}</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
