"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

// The theme is applied before paint by the inline script in app/layout.tsx and
// persisted in localStorage. This button only reads the current value on mount
// and flips it; the initial render matches the server (no theme known yet), so
// hydration stays clean.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("hachisky-theme", next);
    } catch {
      // Private mode or blocked storage: the choice still applies this session.
    }
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-pressed={isDark}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
      <span className={styles.srOnly}>
        {isDark ? "Activar modo claro" : "Activar modo oscuro"}
      </span>
    </button>
  );
}
