import type { Metadata } from "next";
import { PageHeader } from "../../src/shell/PageHeader.tsx";
import { WorkdayPreview } from "../../src/work/WorkdayPreview.tsx";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Trabajo" };

export default function WorkPage() {
  return (
    <div className="container">
      <PageHeader
        moduleId="work"
        title="Registro de jornada"
        description="Así se registrará cada jornada: cliente, horario y actividades realizadas."
      />
      <div className={styles.layout}>
        <WorkdayPreview />
        <aside className={styles.tips} aria-labelledby="tips-title">
          <h2 id="tips-title">Cómo completar la jornada</h2>
          <ol>
            <li>Elige el cliente y la fecha de la jornada.</li>
            <li>Indica el horario de inicio y de término.</li>
            <li>Agrega cada actividad con su duración en minutos.</li>
            <li>Usa las notas para observaciones internas.</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
