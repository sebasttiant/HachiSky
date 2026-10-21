import { requireModule } from "../../../../../src/auth/guard.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { reportImageResponse } from "../../../../../src/reports/image-response.ts";

// One stored figure of a report, for somebody who may reach that report:
// staff see only their own, an administrator reaches every one, and a figure
// that cannot be reached answers exactly like one that does not exist. The
// headers (private, no-store, nosniff, inline with a fixed name) are set in
// reportImageResponse. There is no public URL for these bytes.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("reports", `/api/reports/images/${id}`);
  return reportImageResponse(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
}
