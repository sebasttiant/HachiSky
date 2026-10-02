"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import {
  BANK_ACCOUNTS_PATH,
  bankAccountPath,
  ISSUER_PATH,
  NEW_BANK_ACCOUNT_PATH,
  NEW_SIGNER_PATH,
  SIGNERS_PATH,
  signerPath,
} from "./paths.ts";
import type { BillingActor, BillingDeps } from "./service.ts";
import {
  submitCreateBankAccount,
  submitCreateSigner,
  submitSaveIssuer,
  submitSetBankAccountActive,
  submitSetSignerActive,
  submitUpdateBankAccount,
  submitUpdateSigner,
} from "./submit.ts";

// Every action re-checks on the server that the caller has a session and may
// use Configuración (administrators only); the service then checks the role
// again per operation. Hiding the links is presentation only.
async function billingContext(
  path: string,
): Promise<{ deps: BillingDeps; actor: BillingActor }> {
  const session = await requireModule("settings", path);
  const requestHeaders = await headers();
  return {
    deps: { db: getDb() },
    actor: {
      id: session.user.id,
      role: session.user.role,
      ipAddress:
        requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: requestHeaders.get("user-agent"),
    },
  };
}

export async function saveIssuerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(ISSUER_PATH);
  const state = await submitSaveIssuer(deps, actor, formData);
  if (state.status === "success") revalidatePath(ISSUER_PATH, "layout");
  return state;
}

export async function createBankAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(NEW_BANK_ACCOUNT_PATH);
  const { state, id } = await submitCreateBankAccount(deps, actor, formData);
  if (!id) return state;
  revalidatePath(BANK_ACCOUNTS_PATH, "layout");
  redirect(`${bankAccountPath(id)}?creada=1`);
}

export async function updateBankAccountAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(bankAccountPath(id));
  const state = await submitUpdateBankAccount(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(BANK_ACCOUNTS_PATH, "layout");
  return state;
}

export async function setBankAccountActiveAction(
  id: string,
  active: boolean,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(bankAccountPath(id));
  const state = await submitSetBankAccountActive(deps, actor, id, active);
  if (state.status === "success") revalidatePath(BANK_ACCOUNTS_PATH, "layout");
  return state;
}

export async function createSignerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(NEW_SIGNER_PATH);
  const { state, id } = await submitCreateSigner(deps, actor, formData);
  if (!id) return state;
  revalidatePath(SIGNERS_PATH, "layout");
  redirect(`${signerPath(id)}?creado=1`);
}

export async function updateSignerAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(signerPath(id));
  const state = await submitUpdateSigner(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(SIGNERS_PATH, "layout");
  return state;
}

export async function setSignerActiveAction(
  id: string,
  active: boolean,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await billingContext(signerPath(id));
  const state = await submitSetSignerActive(deps, actor, id, active);
  if (state.status === "success") revalidatePath(SIGNERS_PATH, "layout");
  return state;
}
