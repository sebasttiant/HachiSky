"use client";

import { useRef, useState } from "react";
import { signOut } from "../auth/login.ts";
import styles from "./UserArea.module.css";

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
    <div className={styles.logoutWrap}>
      <button
        type="button"
        className={styles.logout}
        title="Cerrar sesión"
        onClick={logout}
        disabled={pending}
      >
        <LogoutIcon />
        <span className={styles.logoutLabel}>
          {pending ? "Cerrando sesión…" : "Cerrar sesión"}
        </span>
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          No pudimos cerrar la sesión. Intenta de nuevo.
        </p>
      )}
    </div>
  );
}
