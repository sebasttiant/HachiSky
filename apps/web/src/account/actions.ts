"use server";

import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "../auth/auth.ts";
import { getMustChangePassword, requireSession } from "../auth/guard.ts";
import { safeNextPath } from "../auth/next-path.ts";
import {
  CHANGE_PASSWORD_PATH,
  PASSWORD_CHANGED_PARAM,
} from "../auth/password-gate.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import { parseChangePassword } from "../users/forms.ts";
import { changeOwnPassword, UserRuleError } from "../users/service.ts";

const RULE_ERRORS: Partial<
  Record<UserRuleError["code"], { field: string; message: string }>
> = {
  wrong_current_password: {
    field: "currentPassword",
    message: "La contraseña actual no es correcta.",
  },
  same_password: {
    field: "newPassword",
    message: "La nueva contraseña debe ser distinta de la actual.",
  },
};

export async function changeOwnPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession(CHANGE_PASSWORD_PATH);
  const parsed = parseChangePassword(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: parsed.fieldErrors as Record<string, string>,
    };
  }
  const wasPending = await getMustChangePassword(session.user.id);
  const requestHeaders = await headers();
  let setCookies: string[];
  try {
    ({ setCookies } = await changeOwnPassword(
      { auth: getAuth(), db: getDb() },
      {
        id: session.user.id,
        headers: new Headers(requestHeaders),
        ipAddress:
          requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: requestHeaders.get("user-agent"),
      },
      parsed.data,
    ));
  } catch (error) {
    const rule =
      error instanceof UserRuleError ? RULE_ERRORS[error.code] : undefined;
    if (rule) {
      return {
        status: "error",
        message: "Revisa los campos marcados.",
        fieldErrors: { [rule.field]: rule.message },
      };
    }
    // Name only: messages from the auth library may echo request data.
    console.error("[account] password change failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return {
      status: "error",
      message: "No se pudo cambiar la contraseña. Intenta de nuevo.",
    };
  }

  // Every session was replaced; without the new cookie this browser would be
  // signed out on the next request.
  const cookieStore = await cookies();
  for (const header of setCookies) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      cookieStore.set(name, attributes.value, toCookieOptions(attributes));
    }
  }

  // Always a redirect: re-rendering in this request would still read the
  // revoked cookie from the incoming headers and send the user to /login.
  redirect(
    wasPending
      ? safeNextPath(formData.get("next"))
      : `${CHANGE_PASSWORD_PATH}?${PASSWORD_CHANGED_PARAM}=1`,
  );
}
