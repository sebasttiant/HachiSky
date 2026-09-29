import styles from "./PreviewNotice.module.css";

export function PreviewNotice() {
  return (
    <div className={styles.notice}>
      <p className="container">
        <strong>Vista previa:</strong> algunas secciones muestran datos de
        ejemplo y no guardan información.
      </p>
    </div>
  );
}
