import type { ActionState } from "../users/action-state.ts";
import { moveImage, removeImage, updateImageText } from "./images.ts";
import {
  createReport,
  deleteReport,
  type ReportActor,
  type ReportDeps,
  type ReportRuleCode,
  ReportRuleError,
  ReportValidationError,
  replaceItems,
  setActivities,
  updateReport,
  updateSection,
} from "./service.ts";

// Form handling shared by the Server Functions (actions.ts). It stays free of
// framework imports so tests can run it against the real database: the Server
// Function only adds the session guard, headers, revalidation and redirects.

export const REPORT_RULE_MESSAGES: Record<ReportRuleCode, string> = {
  unauthenticated: "Tu sesión ya no es válida. Inicia sesión de nuevo.",
  forbidden: "No tienes permiso para hacer esto.",
  not_found: "Ese informe ya no existe.",
  client_not_found: "Ese cliente ya no existe.",
  section_not_found: "Esa sección ya no existe.",
  // Unreachable and missing give the same answer here too, so the message
  // cannot tell one apart from the other.
  activity_not_found: "Una de las actividades ya no está disponible.",
  image_not_found: "Esa imagen ya no está disponible.",
  image_limit_reached: "Esa sección ya alcanzó el límite de imágenes.",
};

const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
const REPORT_FIELDS = [
  "type",
  "clientId",
  "periodStart",
  "periodEnd",
  "title",
] as const;
const SECTION_FIELDS = ["heading", "body"] as const;
const IMAGE_FIELDS = ["title", "caption"] as const;
const DIRECTIONS = new Set(["up", "down"]);

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

// Rows arrive as parallel indexed fields (`items.0.label`). They are read by
// index so a blank row keeps its position and the order on screen is the
// order stored.
function formToItems(formData: FormData): Record<string, unknown>[] {
  const byIndex = new Map<number, Record<string, unknown>>();
  for (const [key, value] of formData.entries()) {
    const match = /^items\.(\d+)\.(label|body|status|priority|impact)$/.exec(
      key,
    );
    if (!match || typeof value !== "string") continue;
    const index = Number(match[1]);
    const row = byIndex.get(index) ?? {};
    row[match[2]] = value;
    byIndex.set(index, row);
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

function failure(action: string, error: unknown): ActionState {
  if (error instanceof ReportValidationError) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: error.fieldErrors,
    };
  }
  if (error instanceof ReportRuleError) {
    return { status: "error", message: REPORT_RULE_MESSAGES[error.code] };
  }
  // Name only: messages and request data can contain what the author wrote.
  console.error("[reports] action failed", {
    action,
    error: error instanceof Error ? error.name : "unknown",
  });
  return { status: "error", message: GENERIC_ERROR };
}

export async function submitCreateReport(
  deps: ReportDeps,
  actor: ReportActor | null,
  formData: FormData,
): Promise<{ state: ActionState; id?: string }> {
  try {
    const id = await createReport(
      deps,
      actor,
      formToRaw(formData, REPORT_FIELDS),
    );
    return { state: { status: "success" }, id };
  } catch (error) {
    return { state: failure("create_report", error) };
  }
}

export async function submitUpdateReport(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateReport(deps, actor, id, formToRaw(formData, REPORT_FIELDS));
    return { status: "success", message: "Informe guardado." };
  } catch (error) {
    return failure("update_report", error);
  }
}

// The figures of a section. The image itself never comes through here: it is
// uploaded to its own route, which can bound the body (see image-upload.ts).
// What is left is the text, the order and the removal.
//
// An imageId that is absent, malformed or belonging to another report all
// answer the same way, which is the rule the service holds.
function imageIdOf(formData: FormData): string | null {
  const imageId = formData.get("imageId");
  return typeof imageId === "string" && imageId !== "" ? imageId : null;
}

export async function submitUpdateImageText(
  deps: ReportDeps,
  actor: ReportActor | null,
  reportId: string,
  formData: FormData,
): Promise<ActionState> {
  const imageId = imageIdOf(formData);
  if (!imageId) {
    return { status: "error", message: REPORT_RULE_MESSAGES.image_not_found };
  }
  try {
    await updateImageText(
      deps,
      actor,
      reportId,
      imageId,
      formToRaw(formData, IMAGE_FIELDS),
    );
    return { status: "success", message: "Imagen guardada." };
  } catch (error) {
    return failure("update_image_text", error);
  }
}

export async function submitRemoveImage(
  deps: ReportDeps,
  actor: ReportActor | null,
  reportId: string,
  formData: FormData,
): Promise<ActionState> {
  const imageId = imageIdOf(formData);
  if (!imageId) {
    return { status: "error", message: REPORT_RULE_MESSAGES.image_not_found };
  }
  try {
    await removeImage(deps, actor, reportId, imageId);
    return { status: "success", message: "Imagen eliminada." };
  } catch (error) {
    return failure("remove_image", error);
  }
}

export async function submitMoveImage(
  deps: ReportDeps,
  actor: ReportActor | null,
  reportId: string,
  formData: FormData,
): Promise<ActionState> {
  const imageId = imageIdOf(formData);
  if (!imageId) {
    return { status: "error", message: REPORT_RULE_MESSAGES.image_not_found };
  }
  const direction = formData.get("direction");
  // Only the two the service accepts. Anything else is a request that did
  // not come from these buttons, and guessing a direction for it would move
  // somebody's figure somewhere they never asked for.
  if (typeof direction !== "string" || !DIRECTIONS.has(direction)) {
    return { status: "error", message: GENERIC_ERROR };
  }
  try {
    await moveImage(deps, actor, reportId, imageId, direction as "up" | "down");
    return { status: "success" };
  } catch (error) {
    return failure("move_image", error);
  }
}

export async function submitUpdateSection(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  const key = formData.get("key");
  if (typeof key !== "string" || key === "") {
    return { status: "error", message: REPORT_RULE_MESSAGES.section_not_found };
  }
  try {
    await updateSection(
      deps,
      actor,
      id,
      key,
      formToRaw(formData, SECTION_FIELDS),
    );
    return { status: "success", message: "Sección guardada." };
  } catch (error) {
    return failure("update_section", error);
  }
}

export async function submitReplaceItems(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  const key = formData.get("key");
  if (typeof key !== "string" || key === "") {
    return { status: "error", message: REPORT_RULE_MESSAGES.section_not_found };
  }
  try {
    await replaceItems(deps, actor, id, key, formToItems(formData));
    return { status: "success", message: "Sección guardada." };
  } catch (error) {
    return failure("replace_items", error);
  }
}

export async function submitSetActivities(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ids = formData
      .getAll("activityIds")
      .filter((value): value is string => typeof value === "string");
    await setActivities(deps, actor, id, ids);
    return { status: "success", message: "Actividades actualizadas." };
  } catch (error) {
    return failure("set_activities", error);
  }
}

export async function submitDeleteReport(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
): Promise<ActionState> {
  try {
    await deleteReport(deps, actor, id);
    return { status: "success", message: "Informe eliminado." };
  } catch (error) {
    return failure("delete_report", error);
  }
}
