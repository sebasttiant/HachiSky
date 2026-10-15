import { type AppModule, MODULES } from "./navigation.ts";
import styles from "./PreviewNotice.module.css";

// The banner is derived from the module registry, never written by hand.
//
// It used to be a fixed line saying that sections show sample data and save
// nothing. That was true while the modules were mock-ups, and it quietly
// became false as they were built: it was still telling authors their work
// was not being saved while Trabajo and Informes were storing every word.
// Deriving it means the claim cannot outlive the thing it describes.
export function modulesInPreview(
  modules: readonly AppModule[],
): readonly string[] {
  return modules
    .filter((module) => module.availability !== "available")
    .map((module) => module.label);
}

export function PreviewNotice() {
  const pending = modulesInPreview(MODULES);
  if (pending.length === 0) return null;

  return (
    <div className={styles.notice}>
      <p className="container">
        <strong>Vista previa:</strong>{" "}
        {pending.length === 1
          ? `${pending[0]} todavía muestra datos de ejemplo y no guarda información.`
          : `${pending.slice(0, -1).join(", ")} y ${pending.at(-1)} todavía muestran datos de ejemplo y no guardan información.`}
      </p>
    </div>
  );
}
