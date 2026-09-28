import Link from "next/link";
import styles from "./ComingSoon.module.css";
import { ModuleIcon } from "./icons.tsx";
import { MODULES, type ModuleId } from "./navigation.ts";
import { PageHeader } from "./PageHeader.tsx";

export function ComingSoon({
  moduleId,
  title,
  intro,
  planned,
}: {
  moduleId: ModuleId;
  title: string;
  intro: string;
  planned: readonly string[];
}) {
  const module = MODULES.find((m) => m.id === moduleId);
  return (
    <div className="container">
      <PageHeader
        moduleId={moduleId}
        title={title}
        description={module?.description ?? ""}
      />
      <section className={styles.card} aria-labelledby="soon-title">
        <span className={styles.art} aria-hidden="true">
          <ModuleIcon id={moduleId} size={44} />
        </span>
        <div>
          <h2 id="soon-title">Próximamente</h2>
          <p className={styles.intro}>{intro}</p>
          <p className={styles.lead}>Lo que podrás hacer aquí:</p>
          <ul className={styles.list}>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link href="/" className={styles.back}>
            <span aria-hidden="true">←</span> Volver al inicio
          </Link>
        </div>
      </section>
    </div>
  );
}
