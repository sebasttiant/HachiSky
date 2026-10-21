import type { ActionState } from "../users/action-state.ts";
import {
  type ClientActor,
  type ClientRuleCode,
  ClientRuleError,
  type ClientsDeps,
  ClientValidationError,
  createClient,
  setClientActive,
  updateClient,
} from "./service.ts";
import type { ClientField } from "./validation.ts";

// Form handling shared by the Server Functions (actions.ts). It holds no
// framework imports so it can be tested against a real database: the
// Server Function only adds the session guard, headers and redirects.

export const RULE_MESSAGES: Record<ClientRuleCode, string> = {
  unauthenticated: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  forbidden: "No tienes permiso para hacer esto.",
  not_found: "Ese cliente ya no existe.",
  duplicate_identification:
    "Ya existe un cliente con ese tipo y número de identificación (puede estar inactivo).",
};

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

const FIELDS: readonly ClientField[] = [
  "name",
  "identificationType",
  "identificationNumber",
  "address",
  "city",
  "email",
  "phone",
];

// Only strings are read; a file or a missing field becomes undefined and the
// service reports it.
export function formToRaw(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    raw[field] = typeof value === "string" ? value : undefined;
  }
  return raw;
}

function failure(action: string, error: unknown): ActionState {
  if (error instanceof ClientValidationError) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: error.fieldErrors as Record<string, string>,
    };
  }
  if (error instanceof ClientRuleError) {
    return { status: "error", message: RULE_MESSAGES[error.code] };
  }
  // Name only: messages may echo request data.
  console.error("[clients] action failed", {
    action,
    error: error instanceof Error ? error.name : "unknown",
  });
  return { status: "error", message: GENERIC_ERROR };
}

export async function submitCreate(
  deps: ClientsDeps,
  actor: ClientActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createClient(deps, actor, formToRaw(formData));
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create", error) };
  }
}

export async function submitUpdate(
  deps: ClientsDeps,
  actor: ClientActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateClient(deps, actor, id, formToRaw(formData));
    return { status: "success", message: "Cambios guardados." };
  } catch (error) {
    return failure("update", error);
  }
}

export async function submitSetActive(
  deps: ClientsDeps,
  actor: ClientActor | null,
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    await setClientActive(deps, actor, id, active);
    return {
      status: "success",
      message: active
        ? "Cliente reactivado."
        : "Cliente desactivado. Su información se conserva.",
    };
  } catch (error) {
    return failure(active ? "activate" : "deactivate", error);
  }
}
