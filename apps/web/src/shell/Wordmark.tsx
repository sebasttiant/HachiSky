import styles from "./Wordmark.module.css";

// Live HTML wordmark: "Hachi" in brand navy, "Sky" in brand sky blue.
export function Wordmark({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <span className={`${styles.wordmark} ${size === "sm" ? styles.sm : ""}`}>
      Hachi<span className={styles.sky}>Sky</span>
    </span>
  );
}
