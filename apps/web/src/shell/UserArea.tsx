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
      <LogoutButton />
    </div>
  );
}
