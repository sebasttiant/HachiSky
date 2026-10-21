"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireModule } from "../auth/guard.ts";
import { getDb } from "../db/client.ts";
import type { ActionState } from "../users/action-state.ts";
import { NEW_REPORT_PATH, REPORTS_PATH, reportPath } from "./paths.ts";
import { getReport, type ReportActor, type ReportDeps } from "./service.ts";
import {
  REPORT_RULE_MESSAGES,
  submitCreateReport,
  submitDeleteReport,
  submitIssueReport,
  submitMoveImage,
  submitRemoveImage,
  submitReplaceItems,
  submitSetActivities,
  submitUpdateImageText,
  submitUpdateReport,
  submitUpdateSection,
} from "./submit.ts";

// Every action re-checks on the server that the caller has a session and may
// use Informes; the service then checks ownership per row. Hiding links is
// only presentation, never authorization.
async function reportContext(
  path: string,
): Promise<{ deps: ReportDeps; actor: ReportActor }> {
  const session = await requireModule("reports", path);
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

export async function createReportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(NEW_REPORT_PATH);
  const { state, id } = await submitCreateReport(deps, actor, formData);
  if (!id) return state;
  revalidatePath(REPORTS_PATH, "layout");
  redirect(`${reportPath(id)}?creado=1`);
}

export async function updateReportAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitUpdateReport(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(REPORTS_PATH, "layout");
  return state;
}

export async function updateSectionAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitUpdateSection(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

export async function replaceItemsAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitReplaceItems(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

export async function setActivitiesAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitSetActivities(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

// The figures of a section. Uploading one goes to its own route, which can
// bound the request body; these three carry only ids and text.
export async function updateImageTextAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitUpdateImageText(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

export async function removeImageAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitRemoveImage(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

export async function moveImageAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitMoveImage(deps, actor, id, formData);
  if (state.status === "success") revalidatePath(reportPath(id), "page");
  return state;
}

// Uploading a figure goes to its own route, so nothing revalidated the page
// for it. This re-reads the page through the same session and module guard
// as every other action, and writes nothing.
export async function refreshReportAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  // Confirms the actor may still reach this report before re-reading it, so
  // this is not a corner where ownership goes unchecked.
  const report = await getReport(deps, actor, id);
  if (!report) {
    return { status: "error", message: REPORT_RULE_MESSAGES.not_found };
  }
  revalidatePath(reportPath(id), "page");
  return { status: "success" };
}

// Issuing freezes the report as it goes out. The page re-reads itself
// afterwards, so what the author sees next is the closed, issued state.
export async function issueReportAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitIssueReport(deps, actor, id);
  if (state.status === "success") revalidatePath(REPORTS_PATH, "layout");
  return state;
}

export async function deleteReportAction(
  id: string,
  _previous: ActionState,
): Promise<ActionState> {
  const { deps, actor } = await reportContext(reportPath(id));
  const state = await submitDeleteReport(deps, actor, id);
  if (state.status !== "success") return state;
  revalidatePath(REPORTS_PATH, "layout");
  redirect(`${REPORTS_PATH}?eliminado=1`);
}
