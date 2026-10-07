import { requireModule } from "../../../../../src/auth/guard.ts";
import { billingImageResponse } from "../../../../../src/billing/image-response.ts";
import { getDb } from "../../../../../src/db/client.ts";

// One stored billing image version (signature or issuer logo), for
// administrators only: no session redirects to /login, a staff session gets
// a 403 from the guard, and the service checks the role again. The headers
// (private, no-store, nosniff, inline with a fixed name) are set in
// billingImageResponse.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("settings", `/api/billing/images/${id}`);
  return billingImageResponse(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
}
