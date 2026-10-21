import {
  type BillingActor,
  type BillingDeps,
  BillingRuleError,
} from "./service.ts";
import { getBillingImage } from "./signers.ts";

// Builds the response of app/api/billing/images/[id]: one exact stored
// version, administrators only. Kept free of framework imports so it is
// tested against a real database; the route handler only adds the session
// guard. Never cached by shared caches, never sniffed, always displayed
// inline under a fixed name (nothing from the request reaches a header).
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function denied(status: 401 | 403 | 404) {
  return new Response(null, { status, headers: PRIVATE_HEADERS });
}

export async function billingImageResponse(
  deps: BillingDeps,
  actor: BillingActor | null,
  id: string,
): Promise<Response> {
  let image: Awaited<ReturnType<typeof getBillingImage>>;
  try {
    image = await getBillingImage(deps, actor, id);
  } catch (error) {
    if (error instanceof BillingRuleError) {
      return denied(error.code === "unauthenticated" ? 401 : 403);
    }
    throw error;
  }
  if (!image) return denied(404);
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
