// Descriptor of the workday form preview. The preview is deliberately not a
// <form>: it renders as a labelled group, has no action and its only button
// is disabled, so it cannot submit by click or by pressing Enter.
export interface FormField {
  id: string;
  label: string;
  hint?: string;
}

export interface WorkdayFormModel {
  container: "group" | "form";
  action: string | null;
  submit: { disabled: boolean; label: string };
  fields: readonly FormField[];
}

export const workdayForm: WorkdayFormModel = {
  container: "group",
  action: null,
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

export function canSubmit(form: WorkdayFormModel): boolean {
  return form.action !== null && !form.submit.disabled;
}
