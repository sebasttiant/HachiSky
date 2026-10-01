"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "../auth/auth.ts";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "./action-state.ts";
import { USERS_PATH } from "./filters.ts";
import {
  type FieldErrors,
  parseCreateUser,
  parseResetPassword,
  parseUpdateUser,
} from "./forms.ts";
import {
  type AdminActor,
  createUser,
  resetPassword,
  revokeSessions,
  setActive,
  type UserRuleCode,
  UserRuleError,
  type UsersDeps,
  updateUser,
} from "./service.ts";

const RULE_MESSAGES: Record<UserRuleCode, string> = {
  not_found: "Ese usuario ya no existe.",
  email_taken: "Ya hay un usuario con ese correo.",
  self_demotion: "No puedes quitarte a ti mismo el rol de administrador.",
  self_deactivation: "No puedes desactivar tu propia cuenta.",
  self_password_reset:
    "Para tu propia contraseña usa “Cambiar contraseña” en tu menú.",
  self_sessions: "Para cerrar tu propia sesión usa “Cerrar sesión”.",
  last_admin: "Debe quedar al menos un administrador activo.",
};

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

// Every action re-checks on the server that the caller is an admin; the
// buttons being hidden for other roles is presentation only.
async function adminContext(
  path: string,
): Promise<{ deps: UsersDeps; actor: AdminActor }> {
  const session = await requireModule("settings", path);
  const requestHeaders = await headers();
  return {
    deps: { auth: getAuth(), db: getDb() },
    actor: {
      id: session.user.id,
      headers: new Headers(requestHeaders),
      ipAddress:
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}

function failure(action: string, error: unknown): ActionState {
  if (error instanceof UserRuleError) {
    return { status: "error", message: RULE_MESSAGES[error.code] };
  }
  // Name only: messages from the auth library may echo request data.
  console.error("[users] action failed", {
    action,
    error: error instanceof Error ? error.name : "unknown",
  });
  return { status: "error", message: GENERIC_ERROR };
}

function invalid(fieldErrors: FieldErrors<object>): ActionState {
  return {
    status: "error",
    message: "Revisa los campos marcados.",
    fieldErrors: fieldErrors as Record<string, string>,
  };
}

function userPath(id: string) {
  return `${USERS_PATH}/${encodeURIComponent(id)}`;
}

export async function createUserAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await adminContext(USERS_PATH);
  const parsed = parseCreateUser(formData);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  let id: string;
  try {
    ({ id } = await createUser(deps, actor, parsed.data));
  } catch (error) {
    return failure("create", error);
  }
  revalidatePath(USERS_PATH);
  redirect(`${userPath(id)}?creado=1`);
}

export async function updateUserAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await adminContext(userPath(id));
  const parsed = parseUpdateUser(formData);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  try {
    await updateUser(deps, actor, id, parsed.data);
  } catch (error) {
    return failure("update", error);
  }
  revalidatePath(USERS_PATH, "layout");
  return { status: "success", message: "Cambios guardados." };
}

export async function setActiveAction(
  id: string,
  active: boolean,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await adminContext(userPath(id));
  try {
    await setActive(deps, actor, id, active);
  } catch (error) {
    return failure(active ? "activate" : "deactivate", error);
  }
  revalidatePath(USERS_PATH, "layout");
  return {
    status: "success",
    message: active
      ? "Usuario reactivado. Ya puede iniciar sesión."
      : "Usuario desactivado y sus sesiones cerradas.",
  };
}

export async function resetPasswordAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await adminContext(userPath(id));
  const parsed = parseResetPassword(formData);
  if (!parsed.ok) return invalid(parsed.fieldErrors);
  try {
    await resetPassword(deps, actor, id, parsed.data.temporaryPassword);
  } catch (error) {
    return failure("password_reset", error);
  }
  revalidatePath(USERS_PATH, "layout");
  return {
    status: "success",
    message:
      "Contraseña temporal asignada. Se le pedirá cambiarla al entrar; sus sesiones se cerraron.",
  };
}

export async function revokeSessionsAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await adminContext(userPath(id));
  try {
    await revokeSessions(deps, actor, id);
  } catch (error) {
    return failure("sessions_revoke", error);
  }
  revalidatePath(USERS_PATH, "layout");
  return { status: "success", message: "Sesiones cerradas." };
}
