import { requireModule } from "../../../../../src/auth/guard.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { reportIdentityImageResponse } from "../../../../../src/reports/image-response.ts";

// The provider logo or signer signature a report document prints, for
// somebody who may reach that report: staff see only their own reports'
// letterhead, an administrator reaches every one, and an image no reachable
// report uses answers exactly like one that does not exist. Billing's own
// image route stays administrators-only; this is the reports-scoped door.
// The headers (private, no-store, nosniff, inline with a fixed name) are
// set in reportIdentityImageResponse. There is no public URL for these bytes.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("reports", `/api/reports/identity-images/${id}`);
  return reportIdentityImageResponse(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
}
