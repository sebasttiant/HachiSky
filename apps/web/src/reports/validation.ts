import {
  ITEM_FIELDS,
  isReportType,
  type ReportType,
  type SectionKind,
} from "./templates.ts";

// Validation lives beside the service, not in the form: a Server Function is
// a public entry point, so every rule has to hold even when the request did
// not come from our own screen.

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const REPORT_LIMITS = {
  title: 200,
  heading: 200,
  body: 20_000,
  itemLabel: 200,
  itemBody: 5_000,
  impact: 500,
  items: 200,
  activities: 500,
  imageTitle: 200,
  imageCaption: 500,
  // Per section, not per report: a manual with ten steps may legitimately
  // carry a screenshot in each one, while twenty figures under a single
  // heading is somebody pasting a folder in.
  imagesPerSection: 20,
} as const;

export type ReportFieldErrors = Record<string, string>;

export interface ReportInput {
  type: ReportType;
  clientId: string;
  periodStart: string | null;
  periodEnd: string | null;
  title: string;
}

export interface SectionInput {
  heading: string;
  body: string | null;
}

export interface ItemInput {
  label: string;
  body: string | null;
  status: "ok" | "watch" | "risk" | null;
  priority: "low" | "medium" | "high" | null;
  impact: string | null;
}

export interface ImageTextInput {
  title: string;
  caption: string | null;
}

export type Validated<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: ReportFieldErrors };

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Empty becomes null: a blank textarea is an empty section, not an error. */
function optionalText(raw: unknown): string | null {
  const value = text(raw);
  return value === "" ? null : value;
}

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function validateReport(raw: unknown): Validated<ReportInput> {
  const input = record(raw);
  const fieldErrors: ReportFieldErrors = {};

  const type = input.type;
  if (!isReportType(type)) fieldErrors.type = "Elige un tipo de informe.";

  const clientId = text(input.clientId);
  if (!UUID.test(clientId)) fieldErrors.clientId = "Elige un cliente.";

  const title = text(input.title);
  if (title === "") fieldErrors.title = "Escribe un título.";
  else if (title.length > REPORT_LIMITS.title)
    fieldErrors.title = `El título no puede superar ${REPORT_LIMITS.title} caracteres.`;

  const periodStart = optionalText(input.periodStart);
  const periodEnd = optionalText(input.periodEnd);
  for (const [name, value] of [
    ["periodStart", periodStart],
    ["periodEnd", periodEnd],
  ] as const) {
    if (value !== null && !DATE.test(value))
      fieldErrors[name] = "Usa una fecha válida.";
  }
  // Both ends are optional and independent: a diagnóstico describes a moment.
  if (
    !fieldErrors.periodStart &&
    !fieldErrors.periodEnd &&
    periodStart !== null &&
    periodEnd !== null &&
    periodEnd < periodStart
  ) {
    fieldErrors.periodEnd =
      "El fin del período no puede ser anterior al inicio.";
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    data: {
      type: type as ReportType,
      clientId,
      periodStart,
      periodEnd,
      title,
    },
  };
}

export function validateSection(raw: unknown): Validated<SectionInput> {
  const input = record(raw);
  const fieldErrors: ReportFieldErrors = {};

  const heading = text(input.heading);
  if (heading === "") fieldErrors.heading = "La sección necesita un título.";
  else if (heading.length > REPORT_LIMITS.heading)
    fieldErrors.heading = `El título no puede superar ${REPORT_LIMITS.heading} caracteres.`;

  const body = optionalText(input.body);
  if (body !== null && body.length > REPORT_LIMITS.body)
    fieldErrors.body = `El texto no puede superar ${REPORT_LIMITS.body} caracteres.`;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { heading, body } };
}

// The title is required because the document prints it above the figure: an
// untitled screenshot in a client document is noise. The caption is the
// optional sentence that explains what the reader is looking at.
export function validateImageText(raw: unknown): Validated<ImageTextInput> {
  const input = record(raw);
  const fieldErrors: ReportFieldErrors = {};

  const title = text(input.title);
  if (title === "") fieldErrors.title = "La imagen necesita un título.";
  else if (title.length > REPORT_LIMITS.imageTitle)
    fieldErrors.title = `El título no puede superar ${REPORT_LIMITS.imageTitle} caracteres.`;

  const caption = optionalText(input.caption);
  if (caption !== null && caption.length > REPORT_LIMITS.imageCaption)
    fieldErrors.caption = `La descripción no puede superar ${REPORT_LIMITS.imageCaption} caracteres.`;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { title, caption } };
}

const STATUSES = ["ok", "watch", "risk"];
const PRIORITIES = ["low", "medium", "high"];

// Which classifications a row may carry depends on its section: a step has
// no priority, a domain in the semáforo has no impact. Sending one anyway is
// refused rather than quietly dropped, so a caller is never told it stored
// something it did not.
export function validateItems(
  raw: unknown,
  kind: SectionKind,
): Validated<ItemInput[]> {
  const fieldErrors: ReportFieldErrors = {};
  if (kind === "prose") {
    return { ok: false, fieldErrors: { items: "Esta sección es de texto." } };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, fieldErrors: { items: "No se pudo leer la lista." } };
  }
  if (raw.length > REPORT_LIMITS.items) {
    return {
      ok: false,
      fieldErrors: {
        items: `No puede haber más de ${REPORT_LIMITS.items} líneas.`,
      },
    };
  }

  const allowed = ITEM_FIELDS[kind];
  const data: ItemInput[] = [];

  raw.forEach((entry, index) => {
    const item = record(entry);
    const label = text(item.label);
    const body = optionalText(item.body);
    const status = optionalText(item.status);
    const priority = optionalText(item.priority);
    const impact = optionalText(item.impact);

    // A row the author left completely blank is dropped, not rejected: an
    // empty line at the end of a list is a normal way to stop typing.
    if (
      label === "" &&
      body === null &&
      status === null &&
      priority === null &&
      impact === null
    ) {
      return;
    }

    const at = (field: string) => `items.${index}.${field}`;
    if (label === "") fieldErrors[at("label")] = "Escribe un nombre.";
    else if (label.length > REPORT_LIMITS.itemLabel)
      fieldErrors[at("label")] =
        `No puede superar ${REPORT_LIMITS.itemLabel} caracteres.`;

    if (body !== null && body.length > REPORT_LIMITS.itemBody)
      fieldErrors[at("body")] =
        `No puede superar ${REPORT_LIMITS.itemBody} caracteres.`;

    if (status !== null && !allowed.status)
      fieldErrors[at("status")] = "Esta sección no lleva estado.";
    else if (status !== null && !STATUSES.includes(status))
      fieldErrors[at("status")] = "Estado no válido.";

    if (priority !== null && !allowed.priority)
      fieldErrors[at("priority")] = "Esta sección no lleva prioridad.";
    else if (priority !== null && !PRIORITIES.includes(priority))
      fieldErrors[at("priority")] = "Prioridad no válida.";

    if (impact !== null && !allowed.impact)
      fieldErrors[at("impact")] = "Esta sección no lleva impacto.";
    else if (impact !== null && impact.length > REPORT_LIMITS.impact)
      fieldErrors[at("impact")] =
        `No puede superar ${REPORT_LIMITS.impact} caracteres.`;

    data.push({
      label,
      body,
      status: status as ItemInput["status"],
      priority: priority as ItemInput["priority"],
      impact,
    });
  });

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data };
}

export function validateActivityIds(raw: unknown): Validated<string[]> {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      fieldErrors: { activities: "No se pudo leer la selección." },
    };
  }
  if (raw.length > REPORT_LIMITS.activities) {
    return {
      ok: false,
      fieldErrors: {
        activities: `No puedes adjuntar más de ${REPORT_LIMITS.activities} actividades.`,
      },
    };
  }
  const ids: string[] = [];
  for (const entry of raw) {
    const id = text(entry);
    if (!UUID.test(id)) {
      return {
        ok: false,
        fieldErrors: { activities: "Hay una actividad no válida." },
      };
    }
    // The same activity twice is one activity, not an error.
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, data: ids };
}
