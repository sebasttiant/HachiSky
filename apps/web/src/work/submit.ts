import type { ActionState } from "../users/action-state.ts";
import {
  createActivity,
  deleteActivity,
  updateActivity,
  type WorkActor,
  type WorkDeps,
  type WorkRuleCode,
  WorkRuleError,
  WorkValidationError,
} from "./service.ts";

// Form handling shared by the Server Functions (actions.ts). It stays free of
// framework imports so tests can run it against the real database: the Server
// Function only adds the session guard, headers, revalidation and redirects.

export const WORK_RULE_MESSAGES: Record<WorkRuleCode, string> = {
  unauthenticated: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  forbidden: "No tienes permiso para hacer esto.",
  not_found: "Esa actividad ya no existe.",
  client_not_found: "Ese cliente ya no existe.",
};

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
const ACTIVITY_FIELDS = [
  "clientId",
  "performedOn",
  "startedAt",
  "endedAt",
  "title",
  "description",
  "outcome",
  "status",
  "nextSteps",
] as const;

// Only strings are read; a file or a missing field becomes undefined and the
// service reports it with the same validation path used by direct callers.
function formToRaw(
  formData: FormData,
  fields: readonly string[],
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const field of fields) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

function failure(action: string, error: unknown): ActionState {
  if (error instanceof WorkValidationError) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: error.fieldErrors,
    };
  }
  if (error instanceof WorkRuleError) {
    return { status: "error", message: WORK_RULE_MESSAGES[error.code] };
  }
  // Name only: messages and request data can contain client work notes.
  console.error("[work] action failed", {
    action,
    error: error instanceof Error ? error.name : "unknown",
  });
  return { status: "error", message: GENERIC_ERROR };
}

export async function submitCreateActivity(
  deps: WorkDeps,
  actor: WorkActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createActivity(
      deps,
      actor,
      formToRaw(formData, ACTIVITY_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_activity", error) };
  }
}

export async function submitUpdateActivity(
  deps: WorkDeps,
  actor: WorkActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateActivity(deps, actor, id, formToRaw(formData, ACTIVITY_FIELDS));
    return { status: "success", message: "Actividad guardada." };
  } catch (error) {
    return failure("update_activity", error);
  }
}

export async function submitDeleteActivity(
  deps: WorkDeps,
  actor: WorkActor | null,
  id: string,
): Promise<ActionState> {
  try {
    await deleteActivity(deps, actor, id);
    return { status: "success", message: "Actividad eliminada." };
  } catch (error) {
    return failure("delete_activity", error);
  }
}
