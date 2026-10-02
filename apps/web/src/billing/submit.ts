import type { ActionState } from "../users/action-state.ts";
import {
  type BillingActor,
  type BillingDeps,
  type BillingRuleCode,
  BillingRuleError,
  BillingValidationError,
  createBankAccount,
  saveIssuerSettings,
  setBankAccountActive,
  updateBankAccount,
} from "./service.ts";
import type { BankAccountField, IssuerField } from "./validation.ts";

// Form handling shared by the Server Functions (actions.ts). It holds no
// framework imports so it can be tested against a real database: the
// Server Function only adds the session guard, headers and redirects.

export const RULE_MESSAGES: Record<BillingRuleCode, string> = {
  unauthenticated: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  forbidden: "No tienes permiso para hacer esto.",
  not_found: "Esa cuenta bancaria ya no existe.",
  duplicate_bank_account:
    "Ya existe una cuenta con ese banco, número y moneda (puede estar inactiva).",
};

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

const ISSUER_FIELDS: readonly IssuerField[] = [
  "legalName",
  "identificationType",
  "identificationNumber",
  "address",
  "city",
  "phone",
  "email",
  "paymentTerms",
];

const BANK_ACCOUNT_FIELDS: readonly BankAccountField[] = [
  "bankName",
  "accountType",
  "accountNumber",
  "holderName",
  "holderIdentificationType",
  "holderIdentificationNumber",
  "currency",
];

// Only strings are read; a file or a missing field becomes undefined and the
// service reports it.
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
  if (error instanceof BillingValidationError) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: error.fieldErrors as Record<string, string>,
    };
  }
  if (error instanceof BillingRuleError) {
    return { status: "error", message: RULE_MESSAGES[error.code] };
  }
  // Name only: messages may echo request data (account numbers, identifications).
  console.error("[billing] action failed", {
    action,
    error: error instanceof Error ? error.name : "unknown",
  });
  return { status: "error", message: GENERIC_ERROR };
}

export async function submitSaveIssuer(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<ActionState> {
  try {
    await saveIssuerSettings(deps, actor, formToRaw(formData, ISSUER_FIELDS));
    return { status: "success", message: "Datos del emisor guardados." };
  } catch (error) {
    return failure("save_issuer", error);
  }
}

export async function submitCreateBankAccount(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createBankAccount(
      deps,
      actor,
      formToRaw(formData, BANK_ACCOUNT_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_bank_account", error) };
  }
}

export async function submitUpdateBankAccount(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateBankAccount(
      deps,
      actor,
      id,
      formToRaw(formData, BANK_ACCOUNT_FIELDS),
    );
    return { status: "success", message: "Cambios guardados." };
  } catch (error) {
    return failure("update_bank_account", error);
  }
}

export async function submitSetBankAccountActive(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    await setBankAccountActive(deps, actor, id, active);
    return {
      status: "success",
      message: active
        ? "Cuenta reactivada."
        : "Cuenta desactivada. Su información se conserva.",
    };
  } catch (error) {
    return failure(
      active ? "activate_bank_account" : "deactivate_bank_account",
      error,
    );
  }
}
