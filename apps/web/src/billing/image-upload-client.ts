import type { ActionState } from "../users/action-state.ts";
import { IMAGE_LIMITS, IMAGE_REJECTION_MESSAGES } from "./image-limits.ts";

// Browser side of the upload route handlers (src/billing/image-upload.ts):
// sends the raw file same-origin with the session cookie and turns the JSON
// answer into the form state. The size check here only saves a pointless
// request; the server enforces every limit again.

const SESSION_EXPIRED = "Tu sesión ya no es válida. Inicia sesión de nuevo.";
const UPLOAD_FAILED =
  "No se pudo subir la imagen. Revisa tu conexión e intenta de nuevo.";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function imageError(message: string): ActionState {
  return { status: "error", message, fieldErrors: { image: message } };
}

async function readJson(
  response: Response,
): Promise<{ ok?: unknown; message?: unknown } | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
      ? (value as { ok?: unknown; message?: unknown })
      : null;
  } catch {
    return null;
  }
}

export async function uploadBillingImage(
  url: string,
  file: File | null,
  fetchFn: FetchLike = (input, init) => fetch(input, init),
): Promise<ActionState> {
  if (!file || file.size === 0) {
    return imageError(IMAGE_REJECTION_MESSAGES.empty);
  }
  if (file.size > IMAGE_LIMITS.maxInputBytes) {
    return imageError(IMAGE_REJECTION_MESSAGES.too_large);
  }
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      credentials: "same-origin",
      // A redirect means the proxy sent an expired session to /login.
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return { status: "error", message: UPLOAD_FAILED };
  }
  if (response.type === "opaqueredirect" || response.status === 401) {
    return { status: "error", message: SESSION_EXPIRED };
  }
  const body = await readJson(response);
  const message = typeof body?.message === "string" ? body.message : null;
  if (response.ok && body?.ok === true) {
    return { status: "success", message: message ?? undefined };
  }
  return message
    ? imageError(message)
    : { status: "error", message: UPLOAD_FAILED };
}
