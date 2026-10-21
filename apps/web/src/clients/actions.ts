"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import { CLIENTS_PATH } from "./filters.ts";
import type { ClientActor, ClientsDeps } from "./service.ts";
import { submitCreate, submitSetActive, submitUpdate } from "./submit.ts";

// Every action re-checks on the server that the caller has a session and may
// use the module; the service then checks the role per operation. Hiding the
// buttons is presentation only.
async function clientContext(
  path: string,
): Promise<{ deps: ClientsDeps; actor: ClientActor }> {
  const session = await requireModule("clients", path);
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

function clientPath(id: string) {
  return `${CLIENTS_PATH}/${encodeURIComponent(id)}`;
}

export async function createClientAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await clientContext(`${CLIENTS_PATH}/new`);
  const { state, id } = await submitCreate(deps, actor, formData);
  if (!id) return state;
  revalidatePath(CLIENTS_PATH, "layout");
  redirect(`${clientPath(id)}?creado=1`);
}

export async function updateClientAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await clientContext(clientPath(id));
  const state = await submitUpdate(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(CLIENTS_PATH, "layout");
  return state;
}

export async function setClientActiveAction(
  id: string,
  active: boolean,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await clientContext(clientPath(id));
  const state = await submitSetActive(deps, actor, id, active);
  if (state.status === "success") revalidatePath(CLIENTS_PATH, "layout");
  return state;
}
