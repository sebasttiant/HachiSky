import { ActivityMinutes } from "./ActivityMinutes.tsx";
import { sampleWorkday } from "./sample-workday.ts";
import styles from "./WorkdayPreview.module.css";
import { workdayForm } from "./workday-form.ts";

const field = (id: string) => {
  const found = workdayForm.fields.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown field ${id}`);
  return found;
};

// Deliberately NOT a <form>: a labelled group with no action whose only
// button is disabled, so it cannot submit by click or by pressing Enter.
export function WorkdayPreview() {
  const client = field("workday-client");
  const date = field("workday-date");
  const start = field("workday-start");
  const end = field("workday-end");
  const notes = field("workday-notes");

  return (
    // biome-ignore lint/a11y/useSemanticElements: intentional non-form group so the preview cannot submit
    <div role="group" aria-label="Registro de jornada" className={styles.root}>
      <p className={styles.sample}>
        Datos de ejemplo: los cambios no se guardan.
      </p>
      <fieldset className={styles.fieldset}>
        <legend>Datos de la jornada</legend>
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.wide}`}>
            <label htmlFor={client.id}>{client.label}</label>
            <select id={client.id} aria-describedby={`${client.id}-hint`}>
              {sampleWorkday.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p id={`${client.id}-hint`} className={styles.hint}>
              {client.hint}
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor={date.id}>{date.label}</label>
            <input id={date.id} type="date" defaultValue={sampleWorkday.date} />
          </div>
          <div className={styles.field}>
            <label htmlFor={start.id}>{start.label}</label>
            <input
              id={start.id}
              type="time"
              defaultValue={sampleWorkday.startTime}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={end.id}>{end.label}</label>
            <input
              id={end.id}
              type="time"
              defaultValue={sampleWorkday.endTime}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Actividades realizadas</legend>
        <p className={styles.hint}>
          Describe cada actividad y cuánto tiempo tomó, en minutos.
        </p>
        <ActivityMinutes activities={sampleWorkday.activities} />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Notas</legend>
        <div className={styles.field}>
          <label htmlFor={notes.id}>{notes.label}</label>
          <textarea
            id={notes.id}
            rows={3}
            defaultValue={sampleWorkday.notes}
            aria-describedby={`${notes.id}-hint`}
          />
          <p id={`${notes.id}-hint`} className={styles.hint}>
            {notes.hint}
          </p>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="button" disabled={workdayForm.submit.disabled}>
          {workdayForm.submit.label}
        </button>
      </div>
    </div>
  );
}
