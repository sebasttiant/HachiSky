"use client";

import { type FormEvent, useRef, useState } from "react";
import styles from "./LoginForm.module.css";
import { type SignInFailure, signIn } from "./login.ts";

export const LOGIN_ERROR_MESSAGES: Record<SignInFailure, string> = {
  invalid:
    "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
  rate_limited:
    "Demasiados intentos seguidos. Espera unos minutos antes de volver a intentar.",
  unavailable:
    "No pudimos conectar con el servidor. Intenta de nuevo en un momento.",
};

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 6h16v12H4z M4 7l8 6 8-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect
        x="5"
        y="10.5"
        width="14"
        height="9.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {crossed ? (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" />
      ) : null}
    </svg>
  );
}

export function LoginForm({ next }: { next: string }) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SignInFailure | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await signIn(
      String(data.get("email") ?? ""),
      String(data.get("password") ?? ""),
      next,
    );
    if (result.ok) {
      // A full navigation drops any previously cached authenticated shell.
      window.location.replace(result.destination);
      return;
    }
    inFlight.current = false;
    setPending(false);
    setError(result.reason);
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      {error ? (
        <div role="alert" className={styles.alert}>
          {LOGIN_ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor="email">Correo electrónico</label>
        <div className={styles.control}>
          <span className={styles.icon}>
            <MailIcon />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="nombre@empresa.com"
            required
            disabled={pending}
            aria-invalid={error === "invalid" ? true : undefined}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Contraseña</label>
        <div className={styles.control}>
          <span className={styles.icon}>
            <LockIcon />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={pending}
            aria-invalid={error === "invalid" ? true : undefined}
          />
          <button
            type="button"
            className={styles.reveal}
            aria-controls="password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending}
          >
            <EyeIcon crossed={showPassword} />
            <span className={styles.srOnly}>
              {showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            </span>
          </button>
        </div>
      </div>

      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : null}
        {pending ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
      <span role="status" aria-live="polite" className={styles.srOnly}>
        {pending ? "Iniciando sesión…" : ""}
      </span>
    </form>
  );
}
