import { getAuth } from "../../../../src/auth/auth.ts";
import { createAuthRouteHandlers } from "../../../../src/auth/http.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only the allowlisted endpoints in src/auth/http.ts are reachable; other
// methods (PUT, PATCH, DELETE) are not exported, so Next answers 405.
export const { GET, POST } = createAuthRouteHandlers(getAuth);
