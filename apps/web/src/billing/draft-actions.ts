"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import {
  BILLING_PATH,
  draftDocumentPath,
  draftPath,
  NEW_DRAFT_PATH,
} from "./paths.ts";
import type { BillingActor, BillingDeps } from "./service.ts";
import {
  submitCreateDraft,
  submitDiscardDraft,
  submitIssueDraft,
  submitUpdateDraft,
} from "./submit.ts";

// Every action re-checks on the server that the caller has a session and may
// use Facturación (administrators only); the service then checks the role
// again per operation. Hiding the links is presentation only.
async function draftContext(
  path: string,
): Promise<{ deps: BillingDeps; actor: BillingActor }> {
  const session = await requireModule("billing", path);
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

export async function createDraftAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await draftContext(NEW_DRAFT_PATH);
  const { state, id } = await submitCreateDraft(deps, actor, formData);
  if (!id) return state;
  revalidatePath(BILLING_PATH, "layout");
  redirect(`${draftPath(id)}?creado=1`);
}

export async function updateDraftAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await draftContext(draftPath(id));
  const state = await submitUpdateDraft(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(BILLING_PATH, "layout");
  return state;
}

export async function discardDraftAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await draftContext(draftPath(id));
  const state = await submitDiscardDraft(deps, actor, id);
  if (state.status !== "success") return state;
  revalidatePath(BILLING_PATH, "layout");
  redirect(`${BILLING_PATH}?descartado=1`);
}

// Issuing is the last step of a borrador: it takes the consecutive and the
// document stops being editable. The admin lands on the issued document.
export async function issueDraftAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await draftContext(draftPath(id));
  const { state } = await submitIssueDraft(deps, actor, id);
  if (state.status !== "success") return state;
  revalidatePath(BILLING_PATH, "layout");
  redirect(`${draftDocumentPath(id)}?emitida=1`);
}
