// Input rules for recorded work. The service validates with these before
// touching the database, and the database repeats every one of them as a
// CHECK: a bug in here must not be able to store a broken row.

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const OUTCOME_MAX = 2000;
export const NEXT_STEPS_MAX = 2000;

export const ACTIVITY_STATUSES = [
  "completed",
  "in_progress",
  "pending",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  completed: "Realizada",
  in_progress: "En curso",
  pending: "Pendiente",
};

export interface ActivityInput {
  clientId: string;
  performedOn: string;
  startedAt: string | null;
  endedAt: string | null;
  title: string;
  description: string | null;
  outcome: string | null;
  status: ActivityStatus;
  nextSteps: string | null;
}

export type ActivityField = keyof ActivityInput;
export type ActivityFieldErrors = Partial<Record<ActivityField, string>>;
export type ActivityValidation =
  | { ok: true; data: ActivityInput }
  | { ok: false; fieldErrors: ActivityFieldErrors };

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

// Blank optional fields are stored as NULL, so "not written" and "written
// empty" cannot drift apart in the database.
function optional(raw: unknown): string | null {
  const value = text(raw);
  return value === "" ? null : value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validateActivity(raw: unknown): ActivityValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fieldErrors: ActivityFieldErrors = {};

  const clientId = text(input.clientId);
  if (!UUID.test(clientId)) fieldErrors.clientId = "Elige un cliente.";

  const performedOn = text(input.performedOn);
  if (!ISO_DATE.test(performedOn) || !isRealDate(performedOn)) {
    fieldErrors.performedOn = "Escribe una fecha válida.";
  }

  // Hours are optional, but half a range says nothing: either both or none.
  const startedAt = optional(input.startedAt);
  const endedAt = optional(input.endedAt);
  if (startedAt !== null && !CLOCK.test(startedAt)) {
    fieldErrors.startedAt = "Usa el formato HH:MM.";
  }
  if (endedAt !== null && !CLOCK.test(endedAt)) {
    fieldErrors.endedAt = "Usa el formato HH:MM.";
  }
  if (startedAt !== null && endedAt === null) {
    fieldErrors.endedAt = "Indica también la hora de término.";
  }
  if (endedAt !== null && startedAt === null) {
    fieldErrors.startedAt = "Indica también la hora de inicio.";
  }
  if (
    startedAt !== null &&
    endedAt !== null &&
    !fieldErrors.startedAt &&
    !fieldErrors.endedAt &&
    endedAt < startedAt
  ) {
    fieldErrors.endedAt = "La hora de término no puede ser anterior al inicio.";
  }

  const title = text(input.title);
  if (title === "") fieldErrors.title = "Escribe qué se hizo.";
  else if (title.length > TITLE_MAX) {
    fieldErrors.title = `Máximo ${TITLE_MAX} caracteres.`;
  }

  const description = optional(input.description);
  if (description !== null && description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `Máximo ${DESCRIPTION_MAX} caracteres.`;
  }

  const outcome = optional(input.outcome);
  if (outcome !== null && outcome.length > OUTCOME_MAX) {
    fieldErrors.outcome = `Máximo ${OUTCOME_MAX} caracteres.`;
  }

  const nextSteps = optional(input.nextSteps);
  if (nextSteps !== null && nextSteps.length > NEXT_STEPS_MAX) {
    fieldErrors.nextSteps = `Máximo ${NEXT_STEPS_MAX} caracteres.`;
  }

  const status = text(input.status) as ActivityStatus;
  if (!ACTIVITY_STATUSES.includes(status)) {
    fieldErrors.status = "Elige el estado de la actividad.";
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: {
      clientId,
      performedOn,
      startedAt,
      endedAt,
      title,
      description,
      outcome,
      status,
      nextSteps,
    },
  };
}
