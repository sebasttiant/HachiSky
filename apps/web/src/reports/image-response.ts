import { readIdentityImageBytes, readImageBytes } from "./images.ts";
import {
  type ReportActor,
  type ReportDeps,
  ReportRuleError,
} from "./service.ts";

// Builds the response of app/api/reports/images/[id]: one stored figure,
// served only to somebody who may reach the report holding it. Kept free of
// framework imports so it is tested against a real database; the route
// handler only adds the session guard.
//
// Never cached by shared caches, never sniffed, always displayed inline
// under a fixed name — nothing from the request or from what the author
// typed reaches a header. A figure that cannot be reached and one that does
// not exist give the same answer, which is the rule the service already
// holds; this layer must not widen it.
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function denied(status: 401 | 403 | 404) {
  return new Response(null, { status, headers: PRIVATE_HEADERS });
}

export async function reportImageResponse(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
): Promise<Response> {
  let image: Awaited<ReturnType<typeof readImageBytes>>;
  try {
    image = await readImageBytes(deps, actor, id);
  } catch (error) {
    if (error instanceof ReportRuleError) {
      if (error.code === "unauthenticated") return denied(401);
      if (error.code === "forbidden") return denied(403);
      // Unreachable, absent, and an id that cannot name a row at all: the
      // service already answers all three the same way.
      return denied(404);
    }
    throw error;
  }
  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "image/png",
      "Content-Length": String(image.data.length),
      "Content-Disposition": 'inline; filename="imagen.png"',
    },
  });
}

// Same contract as reportImageResponse, for the provider logo and signer
// signature the document prints: served only when the image belongs to a
// report this actor may reach (see readIdentityImageBytes).
export async function reportIdentityImageResponse(
  deps: ReportDeps,
  actor: ReportActor | null,
  id: string,
): Promise<Response> {
  let image: Awaited<ReturnType<typeof readIdentityImageBytes>>;
  try {
    image = await readIdentityImageBytes(deps, actor, id);
  } catch (error) {
    if (error instanceof ReportRuleError) {
      if (error.code === "unauthenticated") return denied(401);
      if (error.code === "forbidden") return denied(403);
      return denied(404);
    }
    throw error;
  }
  return new Response(new Uint8Array(image.data), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "image/png",
      "Content-Length": String(image.data.length),
      "Content-Disposition": 'inline; filename="imagen.png"',
    },
  });
}
