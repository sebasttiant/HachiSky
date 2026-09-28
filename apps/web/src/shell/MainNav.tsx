"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AvailabilityBadge } from "./AvailabilityBadge.tsx";
import { ModuleIcon } from "./icons.tsx";
import styles from "./MainNav.module.css";
import { isActive, MODULES } from "./navigation.ts";

const MENU_ID = "main-menu";

export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const closeAfterNavigation = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div className={styles.wrapper}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.burger} aria-hidden="true" />
        <span>{open ? "Cerrar menú" : "Menú"}</span>
      </button>
      <nav aria-label="Principal">
        <ul id={MENU_ID} className={styles.list} data-open={open}>
          {MODULES.map((module) => {
            const active = isActive(module.href, pathname);
            return (
              <li key={module.id}>
                <Link
                  href={module.href}
                  className={styles.link}
                  aria-current={active ? "page" : undefined}
                  onClick={closeAfterNavigation}
                >
                  <ModuleIcon id={module.id} size={20} />
                  <span>{module.label}</span>
                  {module.availability !== "available" ? (
                    <span className={styles.status}>
                      <AvailabilityBadge status={module.availability} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
