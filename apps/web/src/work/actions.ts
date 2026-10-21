"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import { activityPath, NEW_ACTIVITY_PATH, WORK_PATH } from "./paths.ts";
import type { WorkActor, WorkDeps } from "./service.ts";
import {
  submitCreateActivity,
  submitDeleteActivity,
  submitUpdateActivity,
} from "./submit.ts";

// Every action re-checks on the server that the caller has a session and may
// use Trabajo; the service then checks ownership per row. Hiding links is only
// presentation, never authorization.
async function workContext(
  path: string,
): Promise<{ deps: WorkDeps; actor: WorkActor }> {
  const session = await requireModule("work", path);
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

export async function createActivityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await workContext(NEW_ACTIVITY_PATH);
  const { state, id } = await submitCreateActivity(deps, actor, formData);
  if (!id) return state;
  revalidatePath(WORK_PATH, "layout");
  redirect(`${activityPath(id)}?creado=1`);
}

export async function updateActivityAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await workContext(activityPath(id));
  const state = await submitUpdateActivity(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(WORK_PATH, "layout");
  return state;
}

export async function deleteActivityAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await workContext(activityPath(id));
  const state = await submitDeleteActivity(deps, actor, id);
  if (state.status !== "success") return state;
  revalidatePath(WORK_PATH, "layout");
  redirect(`${WORK_PATH}?eliminado=1`);
}
