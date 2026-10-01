import Link from "next/link";
import { CHANGE_PASSWORD_PATH } from "../auth/password-gate.ts";
import { LogoutButton } from "./LogoutButton.tsx";
import styles from "./UserArea.module.css";

// First letter of the first and last words: "María José de la Cruz" -> "MC".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("es-CO");
}

export function UserArea({
  name,
  jobTitle,
}: {
  name: string;
  jobTitle: string | null;
}) {
  return (
    <div className={styles.area}>
      <div className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(name)}
        </span>
        <p className={styles.identity}>
          <span className={styles.name}>{name}</span>
          {jobTitle ? (
            <span className={styles.jobTitle}>{jobTitle}</span>
          ) : null}
        </p>
      </div>
      <Link
        href={CHANGE_PASSWORD_PATH}
        className={styles.logout}
        title="Cambiar contraseña"
        aria-label="Cambiar contraseña"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle
            cx="8"
            cy="15"
            r="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M11 12l8-8 M16 7l2 2 M14 9l2 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </Link>
      <LogoutButton />
    </div>
  );
}
