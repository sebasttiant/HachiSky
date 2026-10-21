"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CHANGE_PASSWORD_PATH } from "../auth/password-gate.ts";
import type { RoleName } from "../auth/session.ts";
import { roleLabel } from "../users/presentation.ts";
import { LogoutButton } from "./LogoutButton.tsx";
import styles from "./UserArea.module.css";

// First letter of the first and last words: "María José de la Cruz" -> "MC".
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("es-CO");
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle
        cx="8"
        cy="15"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M11 12l8-8 M16 7l2 2 M14 9l2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      className={styles.chevron}
    >
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Disclosure menu (same pattern as MainNav): a native button toggles a panel
// holding the account actions. No arrow-key roving, so no role="menu".
export function UserArea({
  name,
  role,
  jobTitle,
}: {
  name: string;
  role: RoleName;
  jobTitle: string | null;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // Pointer outside or focus moving out of the whole menu closes it
    // without stealing focus.
    const closeIfOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
    };
  }, [open]);

  return (
    <div className={styles.area} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials(name)}
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>{name}</span>
          {jobTitle ? (
            <span className={styles.jobTitle}>{jobTitle}</span>
          ) : null}
        </span>
        <ChevronIcon />
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <p className={styles.panelIdentity}>
          <span className={styles.panelName}>{name}</span>
          <span className={styles.panelMeta}>{roleLabel(role)}</span>
          {jobTitle ? (
            <span className={styles.panelMeta}>{jobTitle}</span>
          ) : null}
        </p>
        <Link
          href={CHANGE_PASSWORD_PATH}
          className={styles.item}
          onClick={() => setOpen(false)}
        >
          <KeyIcon />
          <span>Cambiar contraseña</span>
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
}
