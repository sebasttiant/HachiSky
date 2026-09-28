"use client";

import { useState } from "react";
import { formatDuration } from "../shared/format/duration.ts";
import type { SampleActivity } from "./sample-workday.ts";
import styles from "./WorkdayPreview.module.css";
import { totalMinutes } from "./workday-form.ts";

// Activities with editable minutes. The total is derived from local state
// only: nothing is saved, persisted or sent anywhere.
export function ActivityMinutes({
  activities,
}: {
  activities: readonly SampleActivity[];
}) {
  const [minutes, setMinutes] = useState(() =>
    activities.map((activity) => String(activity.minutes)),
  );

  return (
    <>
      <ol className={styles.activities}>
        {activities.map((activity, index) => (
          <li key={activity.description} className={styles.activity}>
            <div className={styles.field}>
              <label htmlFor={`activity-${index}-description`}>
                Actividad {index + 1}
              </label>
              <textarea
                id={`activity-${index}-description`}
                rows={2}
                defaultValue={activity.description}
              />
            </div>
            <div className={`${styles.field} ${styles.minutes}`}>
              <label htmlFor={`activity-${index}-minutes`}>
                Duración (min)
              </label>
              <input
                id={`activity-${index}-minutes`}
                type="number"
                min={0}
                step={5}
                value={minutes[index]}
                onChange={(event) => {
                  const next = event.target.value;
                  setMinutes((current) =>
                    current.map((value, i) => (i === index ? next : value)),
                  );
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <p className={styles.total} aria-live="polite">
        Total: <strong>{formatDuration(totalMinutes(minutes))}</strong>
      </p>
    </>
  );
}
