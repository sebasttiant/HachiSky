// Descriptor of the workday form preview. The preview is deliberately not a
// <form>: it renders as a labelled group, has no action and its only button
// is disabled, so it cannot submit by click or by pressing Enter. Only what
// WorkdayPreview actually reads lives here.
export interface FormField {
  id: string;
  label: string;
  hint?: string;
}

export interface WorkdayFormModel {
  submit: { disabled: boolean; label: string };
  fields: readonly FormField[];
}

export const workdayForm: WorkdayFormModel = {
  submit: {
    disabled: true,
    label: "Guardar (no disponible en la vista previa)",
  },
  fields: [
    {
      id: "workday-client",
      label: "Cliente",
      hint: "Elige el cliente atendido.",
    },
    { id: "workday-date", label: "Fecha" },
    { id: "workday-start", label: "Hora de inicio" },
    { id: "workday-end", label: "Hora de término" },
    {
      id: "workday-notes",
      label: "Notas",
      hint: "Observaciones internas; no aparecen en el informe.",
    },
  ],
};

// One activity cannot last longer than a day. Bounding each entry also bounds
// the total, so it always stays a finite integer that formatDuration accepts.
export const MAX_ACTIVITY_MINUTES = 1440;

// Plain decimal digits only: no sign, exponent, hex/binary/octal or bare dot.
const DECIMAL_NUMBER = /^\d+(\.\d+)?$/;

// Minutes typed in an input: a plain decimal number between 0 and
// MAX_ACTIVITY_MINUTES; decimals are floored. Anything else (empty, text,
// negative, exponent or hex notation, above the cap) counts as 0.
export function parseMinutes(raw: string): number {
  const text = raw.trim();
  if (!DECIMAL_NUMBER.test(text)) return 0;
  const value = Math.floor(Number(text));
  return value <= MAX_ACTIVITY_MINUTES ? value : 0;
}

export function totalMinutes(raw: readonly string[]): number {
  return raw.reduce((sum, value) => sum + parseMinutes(value), 0);
}
