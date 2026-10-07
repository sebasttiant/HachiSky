import styles from "./admin.module.css";
import { roleLabel } from "./presentation.ts";

export function RoleBadge({ role }: { role: string | null }) {
  return (
    <span
      className={`${styles.badge} ${role === "admin" ? styles.badgeAdmin : styles.badgeStaff}`}
    >
      {roleLabel(role)}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`${styles.badge} ${active ? styles.badgeActive : styles.badgeInactive}`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

export function PendingPasswordBadge() {
  return (
    <span className={`${styles.badge} ${styles.badgePending}`}>
      Debe cambiar contraseña
    </span>
  );
}

export function UserAvatar({
  name,
  active,
}: {
  name: string;
  active: boolean;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length === 0
      ? "?"
      : `${words[0]?.[0] ?? ""}${words.length > 1 ? (words.at(-1)?.[0] ?? "") : ""}`.toLocaleUpperCase(
          "es-CO",
        );
  return (
    <span
      className={`${styles.avatar} ${active ? "" : styles.avatarInactive}`}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}
