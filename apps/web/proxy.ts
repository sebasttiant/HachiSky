import { type NextRequest, NextResponse } from "next/server";
import { getAuth } from "./src/auth/auth.ts";
import { decideProxy } from "./src/auth/proxy-decision.ts";

// Optimistic redirect to /login and sliding-session renewal. Authorization is
// enforced again by requireSession in every page and data entry point.
export async function proxy(request: NextRequest) {
  let decision: Awaited<ReturnType<typeof decideProxy>>;
  try {
    decision = await decideProxy(getAuth(), request);
  } catch {
    // Fixed message only. The page guard still decides.
    console.error("Proxy session check failed");
    return NextResponse.next();
  }
  const response =
    decision.type === "redirect"
      ? NextResponse.redirect(new URL(decision.location, request.url))
      : NextResponse.next();
  for (const cookie of decision.setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

export const config = {
  // Static assets never need a session. Public pages and endpoints are
  // decided in code (isPublicPath) so the rule is testable.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|brand/).*)",
  ],
};
