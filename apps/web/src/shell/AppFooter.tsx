import styles from "./AppFooter.module.css";

export function AppFooter() {
  return (
    <footer className={styles.footer} data-app-chrome="">
      <p className="container">
        HachiSky <span aria-hidden="true">·</span> by IL Asesorías{" "}
        <span aria-hidden="true">·</span> Gestión empresarial inteligente
      </p>
    </footer>
  );
}
