import { LogoutButton } from "./LogoutButton.tsx";
import styles from "./UserArea.module.css";

export function UserArea({
  name,
  jobTitle,
}: {
  name: string;
  jobTitle: string | null;
}) {
  return (
    <div className={styles.area}>
      <p className={styles.identity}>
        <span className={styles.name}>{name}</span>
        {jobTitle ? <span className={styles.jobTitle}>{jobTitle}</span> : null}
      </p>
      <LogoutButton />
    </div>
  );
}
