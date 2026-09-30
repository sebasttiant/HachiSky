import { LoginForm } from "../../src/auth/LoginForm.tsx";
import { safeNextPath } from "../../src/auth/next-path.ts";
import styles from "./page.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <main id="contenido" tabIndex={-1} className={styles.main}>
      <section className={styles.card} aria-labelledby="login-heading">
        <p>HachiSky</p>
        <h1 id="login-heading">Iniciar sesión</h1>
        <p>Ingresá con tu correo electrónico y contraseña.</p>
        <LoginForm next={safeNextPath(next)} />
      </section>
    </main>
  );
}
