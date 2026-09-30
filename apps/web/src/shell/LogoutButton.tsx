"use client";

import { useRef, useState } from "react";
import { signOut } from "../auth/login.ts";
import styles from "./UserArea.module.css";

export function LogoutButton() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(false);
    if (await signOut()) {
      // A full navigation drops the cached authenticated shell.
      window.location.replace("/login");
      return;
    }
    inFlight.current = false;
    setPending(false);
    setError(true);
  }

  return (
    <>
      <button
        type="button"
        className={styles.logout}
        onClick={logout}
        disabled={pending}
      >
        {pending ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          No pudimos cerrar la sesión. Intentá nuevamente.
        </p>
      )}
    </>
  );
}
