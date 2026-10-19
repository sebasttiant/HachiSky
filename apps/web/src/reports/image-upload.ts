import type { ModuleAccess } from "../auth/module-access.ts";
import { readLimitedBody } from "../images/body.ts";
import {
  IMAGE_LIMITS,
  IMAGE_REJECTION_MESSAGES,
  type ImageDecoder,
  type ImageRejection,
  processImage,
  sharpDecoder,
} from "../images/pipeline.ts";
import { addImage } from "./images.ts";
import { canPerformReportOperation } from "./permissions.ts";
import {
  type ReportActor,
  type ReportDeps,
  type ReportRuleCode,
  ReportRuleError,
  ReportValidationError,
} from "./service.ts";
import { REPORT_RULE_MESSAGES } from "./submit.ts";

// The dedicated upload route for the figures of a report section
// (app/api/reports/[id]/sections/[key]/images): a multipart body carrying
// the image, its title and its optional description.
//
// Multipart rather than a raw body because a figure arrives with its text,
// and the title is required. `Request.formData()` has no size limit of its
// own, so the body is read through the shared bounded reader FIRST and the
// multipart is parsed from that buffer — never from the live stream. Kept
// free of framework imports so it is tested against a real database; the
// route only adds the session lookup.
//
// Order, cheapest first, nothing read from the body until every header
// check passed:
//   1. Origin must equal the configured app origin and Sec-Fetch-Site, when
//      sent, must be same-origin (CSRF);
//   2. a session (401), not forbidden, and a role allowed to edit (403);
//   3. Content-Type multipart/form-data (415);
//   4. Content-Length, when sent, a plain integer (400) not over the bound
//      (413) — a request that declares nothing is still bounded by step 5;
//   5. the body is streamed and abandoned as soon as it passes the bound
//      (413), and only then parsed;
//   6. exactly one file part, then the shared pipeline, then the service
//      (ownership, validation, the per-section limit and audit).

export type ReportUploadAccess =
  | { status: "authenticated"; actor: ReportActor }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

export interface ReportUploadInput {
  request: Request;
  access: ReportUploadAccess;
  // new URL(BETTER_AUTH_URL).origin: the only origin allowed to upload.
  appOrigin: string;
  reportId: string;
  sectionKey: string;
  decoder?: ImageDecoder;
}

// Room for the multipart envelope on top of the image itself: the
// boundaries, the part headers, and the title and description. Deliberately
// small, so the bound stays about the image and not about the text.
const FIELD_ENVELOPE_BYTES = 8 * 1024;

/** The largest multipart body this route will hold, image plus envelope. */
export const MAX_UPLOAD_BYTES =
  IMAGE_LIMITS.maxInputBytes + FIELD_ENVELOPE_BYTES;

const CROSS_ORIGIN_MESSAGE =
  "Solicitud no permitida. Sube la imagen desde la aplicación.";
const BAD_REQUEST_MESSAGE = "La solicitud no es válida. Intenta de nuevo.";
const INVALID_MESSAGE = "Revisa los campos marcados.";
const GENERIC_ERROR = "No se pudo guardar la imagen. Intenta de nuevo.";

const RULE_STATUS: Record<ReportRuleCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  client_not_found: 404,
  section_not_found: 404,
  activity_not_found: 404,
  image_not_found: 404,
  image_limit_reached: 409,
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function refuse(status: number, error: string, message: string): Response {
  return json(status, { ok: false, error, message });
}

function imageRefusal(reason: ImageRejection): Response {
  return refuse(
    reason === "too_large" ? 413 : 400,
    reason,
    IMAGE_REJECTION_MESSAGES[reason],
  );
}

export function reportActorFrom(
  access: ModuleAccess,
  headers: Headers,
): ReportUploadAccess {
  if (access.status !== "authenticated") return access;
  return {
    status: "authenticated",
    actor: {
      id: access.session.user.id,
      role: access.session.user.role,
      ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: headers.get("user-agent"),
    },
  };
}

// Origin is sent by browsers on every POST fetch; a missing or "null" Origin
// is refused. Sec-Fetch-Site is checked when present (older browsers omit
// it; the Origin check still applies).
function isSameOrigin(headers: Headers, appOrigin: string): boolean {
  const origin = headers.get("origin");
  if (!origin || origin !== appOrigin) return false;
  const site = headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

function mediaType(headers: Headers): string {
  return (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

type Parts =
  | { ok: true; file: File; title: unknown; caption: unknown }
  | { ok: false; reason: "bad_request" | "empty" };

/**
 * Parses the already-bounded buffer as multipart.
 *
 * Exactly one file part, named `image`. More than one is refused rather than
 * silently ignored: a caller that sent two figures should be told, not have
 * one of them dropped.
 */
async function readParts(bytes: Buffer, contentType: string): Promise<Parts> {
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(bytes), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    return { ok: false, reason: "bad_request" };
  }
  const files = [...form.values()].filter(
    (value): value is File => typeof value !== "string",
  );
  if (files.length !== 1) return { ok: false, reason: "bad_request" };
  const file = form.get("image");
  if (file === null || typeof file === "string") {
    return { ok: false, reason: "bad_request" };
  }
  if (file.size === 0) return { ok: false, reason: "empty" };
  return {
    ok: true,
    file,
    title: form.get("title") ?? undefined,
    caption: form.get("caption") ?? undefined,
  };
}

export async function handleReportImageUpload(
  deps: ReportDeps,
  input: ReportUploadInput,
): Promise<Response> {
  const { request, access, reportId, sectionKey } = input;
  const headers = request.headers;

  if (!isSameOrigin(headers, input.appOrigin)) {
    return refuse(403, "cross_origin", CROSS_ORIGIN_MESSAGE);
  }
  if (access.status === "unauthenticated") {
    return refuse(401, "unauthenticated", REPORT_RULE_MESSAGES.unauthenticated);
  }
  if (
    access.status === "forbidden" ||
    !canPerformReportOperation(access.actor.role, "edit_report")
  ) {
    return refuse(403, "forbidden", REPORT_RULE_MESSAGES.forbidden);
  }
  const contentType = headers.get("content-type") ?? "";
  if (mediaType(headers) !== "multipart/form-data") {
    return refuse(
      415,
      "unsupported_type",
      IMAGE_REJECTION_MESSAGES.unsupported_type,
    );
  }
  const declared = headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) {
      return refuse(400, "bad_request", BAD_REQUEST_MESSAGE);
    }
    if (Number(declared) > MAX_UPLOAD_BYTES) return imageRefusal("too_large");
  }

  const body = await readLimitedBody(request.body, MAX_UPLOAD_BYTES);
  if (!body.ok) return imageRefusal("too_large");
  if (body.bytes.length === 0) return imageRefusal("empty");

  const parts = await readParts(body.bytes, contentType);
  if (!parts.ok) {
    return parts.reason === "empty"
      ? imageRefusal("empty")
      : refuse(400, "bad_request", BAD_REQUEST_MESSAGE);
  }

  // The declared part type and the filename are never trusted: the pipeline
  // decides from the bytes themselves.
  const raw = Buffer.from(await parts.file.arrayBuffer());
  const processed = await processImage(
    raw,
    "report_figure",
    input.decoder ?? sharpDecoder,
  );
  if (!processed.ok) return imageRefusal(processed.reason);

  try {
    const imageId = await addImage(
      deps,
      access.actor,
      reportId,
      sectionKey,
      { title: parts.title, caption: parts.caption },
      processed.image,
    );
    return json(201, { ok: true, imageId, message: "Imagen guardada." });
  } catch (error) {
    if (error instanceof ReportValidationError) {
      return json(422, {
        ok: false,
        error: "invalid",
        message: INVALID_MESSAGE,
        fieldErrors: error.fieldErrors,
      });
    }
    if (error instanceof ReportRuleError) {
      return refuse(
        RULE_STATUS[error.code],
        error.code,
        REPORT_RULE_MESSAGES[error.code],
      );
    }
    // Name only: messages can echo what the author wrote.
    console.error("[reports] image upload failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return refuse(500, "unexpected", GENERIC_ERROR);
  }
}
