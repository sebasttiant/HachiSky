"use client";

import { type FormEvent, useRef, useState } from "react";
import styles from "./LoginForm.module.css";
import { signIn } from "./login.ts";

export function LoginForm({ next }: { next: string }) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setPending(true);
    setError(false);
    const destination = await signIn(
      String(data.get("email") ?? ""),
      String(data.get("password") ?? ""),
      next,
    );
    if (destination !== null) {
      // A full navigation drops any previously cached authenticated shell.
      window.location.replace(destination);
      return;
    }
    inFlight.current = false;
    setPending(false);
    setError(true);
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <label htmlFor="email">Correo electrónico</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        disabled={pending}
      />
      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        disabled={pending}
      />
      {error && (
        <p role="alert">
          No pudimos iniciar sesión. Verificá tus datos e intentá nuevamente.
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Iniciando sesión…" : "Iniciar sesión"}
      </button>
      <span role="status" aria-live="polite">
        {pending ? "Iniciando sesión…" : ""}
      </span>
    </form>
  );
}
