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

// Minutes typed in an input: whole, non-negative and finite. Anything else
// (empty, text, negative, NaN, Infinity) counts as 0; decimals are floored.
export function parseMinutes(raw: string): number {
  const text = raw.trim();
  if (text === "") return 0;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function totalMinutes(raw: readonly string[]): number {
  return raw.reduce((sum, value) => sum + parseMinutes(value), 0);
}
