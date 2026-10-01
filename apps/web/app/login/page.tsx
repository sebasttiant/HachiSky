import type { Metadata } from "next";
import { LoginForm } from "../../src/auth/LoginForm.tsx";
import { safeNextPath } from "../../src/auth/next-path.ts";
import { AppFooter } from "../../src/shell/AppFooter.tsx";
import headerStyles from "../../src/shell/AppHeader.module.css";
import { Wordmark } from "../../src/shell/Wordmark.tsx";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Same brand bar as the app header, without navigation: nothing behind it is
// reachable before signing in.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <header className={headerStyles.header}>
        <div className={`container ${headerStyles.bar}`}>
          <span className={headerStyles.brand}>
            {/* biome-ignore lint/performance/noImgElement: tiny static derivatives, no optimizer */}
            <img
              className={headerStyles.mark}
              src="/brand/hachisky-mark-96.png"
              srcSet="/brand/hachisky-mark-96.png 96w, /brand/hachisky-mark-144.png 144w"
              sizes="48px"
              alt=""
              width={48}
              height={47}
              fetchPriority="high"
            />
            <Wordmark />
          </span>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className={styles.main}>
        <section className={styles.card} aria-labelledby="login-heading">
          <div className={styles.intro}>
            {/* biome-ignore lint/performance/noImgElement: tiny static derivatives, no optimizer */}
            <img
              className={styles.mark}
              src="/brand/hachisky-mark-144.png"
              alt=""
              width={72}
              height={71}
            />
            <div className={styles.heading}>
              <h1 id="login-heading">Iniciar sesión</h1>
              <p>Accede a HachiSky con tu correo y contraseña de trabajo.</p>
            </div>
          </div>
          <LoginForm next={safeNextPath(next)} />
          <p className={styles.help}>
            ¿No tienes cuenta o olvidaste tu contraseña? Pide ayuda a un
            administrador de IL Asesorías.
          </p>
        </section>
      </main>

      <AppFooter />
    </>
  );
}
