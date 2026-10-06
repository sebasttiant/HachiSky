import type { ActionState } from "../users/action-state.ts";
import {
  createIssuer,
  setDefaultIssuer,
  setIssuerActive,
  updateIssuer,
} from "./issuers.ts";
import {
  type BillingActor,
  type BillingDeps,
  type BillingRuleCode,
  BillingRuleError,
  BillingValidationError,
  createBankAccount,
  setBankAccountActive,
  updateBankAccount,
} from "./service.ts";
import { createSigner, setSignerActive, updateSigner } from "./signers.ts";
import type {
  BankAccountField,
  IssuerField,
  SignerField,
} from "./validation.ts";

// Form handling shared by the Server Functions (actions.ts). It holds no
// framework imports so it can be tested against a real database: the
// Server Function only adds the session guard, headers and redirects.

export const RULE_MESSAGES: Record<BillingRuleCode, string> = {
  unauthenticated: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  forbidden: "No tienes permiso para hacer esto.",
  not_found: "Esa cuenta bancaria ya no existe.",
  duplicate_bank_account:
    "Ya existe una cuenta con ese banco, número y moneda (puede estar inactiva).",
  signer_not_found: "Ese firmante ya no existe.",
  duplicate_signer:
    "Ya existe un firmante con esa identificación (puede estar inactivo).",
  issuer_not_found: "Ese emisor ya no existe.",
  duplicate_issuer:
    "Ya existe un emisor con esa identificación (puede estar inactivo).",
  issuer_is_default:
    "Este es el emisor predeterminado. Elige primero otro emisor como predeterminado para poder desactivarlo.",
  issuer_inactive:
    "Ese emisor está inactivo. Reactívalo o elige un emisor activo.",
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

const SIGNER_FIELDS: readonly SignerField[] = [
  "fullName",
  "identificationType",
  "identificationNumber",
  "jobTitle",
  "email",
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

// ---- Issuer profiles ----------------------------------------------------------

// `isDefault` tells the page whether this first issuer became the default.
export async function submitCreateIssuer(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string; isDefault?: boolean }> {
  try {
    const { id, isDefault } = await createIssuer(
      deps,
      actor,
      formToRaw(formData, ISSUER_FIELDS),
    );
    return { state: { status: "success" }, id, isDefault };
  } catch (error) {
    return { state: failure("create_issuer", error) };
  }
}

export async function submitUpdateIssuer(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateIssuer(deps, actor, id, formToRaw(formData, ISSUER_FIELDS));
    return { status: "success", message: "Cambios guardados." };
  } catch (error) {
    return failure("update_issuer", error);
  }
}

export async function submitSetIssuerActive(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    await setIssuerActive(deps, actor, id, active);
    return {
      status: "success",
      message: active
        ? "Emisor reactivado."
        : "Emisor desactivado. Su información y sus logos se conservan.",
    };
  } catch (error) {
    return failure(active ? "activate_issuer" : "deactivate_issuer", error);
  }
}

export async function submitSetDefaultIssuer(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
): Promise<ActionState> {
  try {
    await setDefaultIssuer(deps, actor, id);
    return { status: "success", message: "Ahora es el emisor predeterminado." };
  } catch (error) {
    return failure("set_default_issuer", error);
  }
}

// ---- Bank accounts ------------------------------------------------------------

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

// ---- Signers and images -----------------------------------------------------

export async function submitCreateSigner(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createSigner(
      deps,
      actor,
      formToRaw(formData, SIGNER_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_signer", error) };
  }
}

export async function submitUpdateSigner(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateSigner(deps, actor, id, formToRaw(formData, SIGNER_FIELDS));
    return { status: "success", message: "Cambios guardados." };
  } catch (error) {
    return failure("update_signer", error);
  }
}

export async function submitSetSignerActive(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    await setSignerActive(deps, actor, id, active);
    return {
      status: "success",
      message: active
        ? "Firmante reactivado."
        : "Firmante desactivado. Su información y sus firmas se conservan.",
    };
  } catch (error) {
    return failure(active ? "activate_signer" : "deactivate_signer", error);
  }
}
