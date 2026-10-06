import type { ModuleAccess } from "../auth/module-access.ts";
import {
  BillingImageError,
  IMAGE_LIMITS,
  IMAGE_REJECTION_MESSAGES,
  type ImageDecoder,
  type ImageRejection,
  sharpDecoder,
} from "./image.ts";
import { uploadIssuerLogo } from "./issuers.ts";
import { canPerformBillingSettingsOperation } from "./permissions.ts";
import {
  type BillingActor,
  type BillingDeps,
  type BillingRuleCode,
  BillingRuleError,
} from "./service.ts";
import { uploadSignerSignature } from "./signers.ts";
import { RULE_MESSAGES } from "./submit.ts";

// The dedicated upload route handlers (app/api/billing/uploads/...): the
// image is the raw request body (not multipart, not a Server Function), so
// the 1 MB limit is enforced here instead of raising the global Server
// Function body limit. Kept free of framework imports so it is tested
// against a real database; the route only adds the session lookup.
//
// Order, cheapest first, nothing read from the body until every header
// check passed:
//   1. Origin must equal the configured app origin and Sec-Fetch-Site, when
//      sent, must be same-origin (CSRF);
//   2. a session (401), not forbidden, and a role allowed to upload (403);
//   3. Content-Type image/png or image/jpeg (415);
//   4. Content-Length, when sent, a plain integer (400) not over 1 MB (413);
//   5. the body is streamed and abandoned as soon as it passes 1 MB (413);
//   6. the existing pipeline and service (validation, version, audit).

export type UploadAccess =
  | { status: "authenticated"; actor: BillingActor }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

export type UploadTarget =
  | { kind: "signature"; signerId: string }
  | { kind: "issuer_logo"; issuerId: string };

export interface UploadInput {
  request: Request;
  access: UploadAccess;
  // new URL(BETTER_AUTH_URL).origin: the only origin allowed to upload.
  appOrigin: string;
  target: UploadTarget;
  decoder?: ImageDecoder;
}

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);

const CROSS_ORIGIN_MESSAGE =
  "Solicitud no permitida. Sube la imagen desde la aplicación.";
const BAD_REQUEST_MESSAGE = "La solicitud no es válida. Intenta de nuevo.";
const GENERIC_ERROR = "No se pudo guardar la imagen. Intenta de nuevo.";

const SUCCESS_MESSAGES: Record<UploadTarget["kind"], string> = {
  signature: "Firma guardada.",
  issuer_logo: "Logo guardado.",
};

const RULE_STATUS: Record<BillingRuleCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  signer_not_found: 404,
  issuer_not_found: 404,
  issuer_inactive: 409,
  issuer_is_default: 409,
  duplicate_bank_account: 409,
  duplicate_signer: 409,
  duplicate_issuer: 409,
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

export function billingActorFrom(
  access: ModuleAccess,
  headers: Headers,
): UploadAccess {
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

type BodyResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "too_large" };

// Reads the body counting bytes; cancels the stream as soon as the count
// passes the limit, so at most one chunk beyond the limit is ever held.
export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<BodyResult> {
  if (!body) return { ok: true, bytes: Buffer.alloc(0) };
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    parts.push(value);
  }
  return { ok: true, bytes: Buffer.concat(parts, total) };
}

export async function handleBillingImageUpload(
  deps: BillingDeps,
  input: UploadInput,
): Promise<Response> {
  const { request, access, target } = input;
  const headers = request.headers;

  if (!isSameOrigin(headers, input.appOrigin)) {
    return refuse(403, "cross_origin", CROSS_ORIGIN_MESSAGE);
  }
  if (access.status === "unauthenticated") {
    return refuse(401, "unauthenticated", RULE_MESSAGES.unauthenticated);
  }
  const operation =
    target.kind === "signature" ? "upload_signature" : "upload_issuer_logo";
  if (
    access.status === "forbidden" ||
    !canPerformBillingSettingsOperation(access.actor.role, operation)
  ) {
    return refuse(403, "forbidden", RULE_MESSAGES.forbidden);
  }
  if (!ACCEPTED_TYPES.has(mediaType(headers))) {
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
    if (Number(declared) > IMAGE_LIMITS.maxInputBytes) {
      return imageRefusal("too_large");
    }
  }

  const body = await readLimitedBody(request.body, IMAGE_LIMITS.maxInputBytes);
  if (!body.ok) return imageRefusal("too_large");
  if (body.bytes.length === 0) return imageRefusal("empty");

  const bytes = body.bytes;
  const upload = {
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.length,
      ) as ArrayBuffer,
  };
  const decoder = input.decoder ?? sharpDecoder;
  try {
    const { imageId } =
      target.kind === "signature"
        ? await uploadSignerSignature(
            deps,
            access.actor,
            target.signerId,
            upload,
            decoder,
          )
        : await uploadIssuerLogo(
            deps,
            access.actor,
            target.issuerId,
            upload,
            decoder,
          );
    return json(201, {
      ok: true,
      imageId,
      message: SUCCESS_MESSAGES[target.kind],
    });
  } catch (error) {
    if (error instanceof BillingImageError) return imageRefusal(error.reason);
    if (error instanceof BillingRuleError) {
      return refuse(
        RULE_STATUS[error.code],
        error.code,
        RULE_MESSAGES[error.code],
      );
    }
    // Name only: messages may echo request data.
    console.error("[billing] image upload failed", {
      target: target.kind,
      error: error instanceof Error ? error.name : "unknown",
    });
    return refuse(500, "unexpected", GENERIC_ERROR);
  }
}
