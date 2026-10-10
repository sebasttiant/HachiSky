import type { ActionState } from "../users/action-state.ts";
import {
  createDeclaration,
  setDeclarationActive,
  updateDeclaration,
} from "./declarations.ts";
import { createDraft, discardDraft, updateDraft } from "./drafts.ts";
import {
  createIssuer,
  setDefaultIssuer,
  setIssuerActive,
  updateIssuer,
} from "./issuers.ts";
import { configureNumbering } from "./numbering.ts";
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
  DeclarationField,
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
  declaration_not_found: "Esa declaración ya no existe.",
  duplicate_declaration:
    "Ya existe una declaración con ese nombre (puede estar inactiva).",
  draft_not_found: "Ese borrador ya no existe.",
  numbering_not_configured:
    "Primero indica desde qué número continúa el consecutivo de este emisor.",
  numbering_backwards:
    "El consecutivo solo puede avanzar: elige un número mayor.",
  numbering_skips_ahead:
    "La numeración no deja huecos: usa el siguiente número de la serie.",
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
  "issuerProfileId",
];

const SIGNER_FIELDS: readonly SignerField[] = [
  "fullName",
  "identificationType",
  "identificationNumber",
  "jobTitle",
  "email",
];

const DECLARATION_FIELDS: readonly DeclarationField[] = ["label", "body"];

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

// ---- Declaration texts ------------------------------------------------------

export async function submitCreateDeclaration(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createDeclaration(
      deps,
      actor,
      formToRaw(formData, DECLARATION_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_declaration", error) };
  }
}

export async function submitUpdateDeclaration(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateDeclaration(
      deps,
      actor,
      id,
      formToRaw(formData, DECLARATION_FIELDS),
    );
    return { status: "success", message: "Cambios guardados." };
  } catch (error) {
    return failure("update_declaration", error);
  }
}

export async function submitSetDeclarationActive(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  active: boolean,
): Promise<ActionState> {
  try {
    await setDeclarationActive(deps, actor, id, active);
    return {
      status: "success",
      message: active
        ? "Declaración reactivada."
        : "Declaración desactivada. Su texto se conserva.",
    };
  } catch (error) {
    return failure("set_declaration_active", error);
  }
}

// ---- Drafts (cuentas de cobro) ----------------------------------------------

const NEW_DRAFT_FIELDS = ["clientId", "issuerProfileId", "currency"] as const;
const DRAFT_HEADER_FIELDS = [
  ...NEW_DRAFT_FIELDS,
  "bankAccountId",
  "signerProfileId",
  "declarationTextId",
  "paymentTerms",
] as const;
const LINE_FIELDS = ["product", "description", "quantity", "amount"] as const;
// Rows are numbered from 0; the form never sends more than 100 rows (the
// service refuses more than 50 filled ones).
const LINE_KEY = /^lines\.(\d{1,2})\.(product|description|quantity|amount)$/;

// Line fields arrive as `lines.<row>.<field>`. Rows keep the number the form
// gave them (gaps become empty rows) so errors point back at the right row.
export function draftFormToRaw(formData: FormData): Record<string, unknown> {
  const raw = formToRaw(formData, DRAFT_HEADER_FIELDS);
  const lines: Record<string, unknown>[] = [];
  for (const [key, value] of formData.entries()) {
    const match = LINE_KEY.exec(key);
    if (!match || typeof value !== "string") continue;
    const row = Number(match[1]);
    for (let index = lines.length; index <= row; index += 1) {
      lines.push(
        Object.fromEntries(LINE_FIELDS.map((field) => [field, undefined])),
      );
    }
    const target = lines[row];
    if (target) target[match[2] as string] = value;
  }
  raw.lines = lines;
  return raw;
}

export async function submitCreateDraft(
  deps: BillingDeps,
  actor: BillingActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const { id } = await createDraft(
      deps,
      actor,
      formToRaw(formData, NEW_DRAFT_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_draft", error) };
  }
}

export async function submitUpdateDraft(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateDraft(deps, actor, id, draftFormToRaw(formData));
    return { status: "success", message: "Borrador guardado." };
  } catch (error) {
    return failure("update_draft", error);
  }
}

export async function submitDiscardDraft(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
): Promise<ActionState> {
  try {
    await discardDraft(deps, actor, id);
    return { status: "success", message: "Borrador descartado." };
  } catch (error) {
    return failure("discard_draft", error);
  }
}

// ---- Numbering ---------------------------------------------------------------

// Where an issuer's consecutive continues from. The service refuses to walk
// the series backwards; the form only reports what it said.
export async function submitConfigureNumbering(
  deps: BillingDeps,
  actor: BillingActor | null,
  issuerProfileId: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await configureNumbering(
      deps,
      actor,
      issuerProfileId,
      formToRaw(formData, ["nextNumber"]),
    );
    return { status: "success", message: "Consecutivo actualizado." };
  } catch (error) {
    return failure("configure_numbering", error);
  }
}
