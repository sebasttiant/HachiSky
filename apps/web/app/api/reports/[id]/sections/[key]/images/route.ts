import { checkModuleAccess } from "../../../../../../../src/auth/guard.ts";
import { getDb } from "../../../../../../../src/db/client.ts";
import {
  handleReportImageUpload,
  reportActorFrom,
} from "../../../../../../../src/reports/image-upload.ts";
import { loadAuthEnv } from "../../../../../../../src/shared/config/env.ts";

// Uploads one figure into a section of a report: multipart body with the
// image, its title and its optional description. Same-origin only, a
// session that may use Informes only, and the service then checks that this
// actor may reach this report. The body limit is enforced before and while
// reading it (see src/reports/image-upload.ts), so the global Server
// Function body limit stays at its default. Answers JSON with Spanish
// messages.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const { id, key } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const access = await checkModuleAccess("reports", `/api/reports/${id}/sections/${key}/images`);
  return handleReportImageUpload(
    { db: getDb() },
    {
      request,
      access: reportActorFrom(access, request.headers),
      appOrigin: new URL(loadAuthEnv().BETTER_AUTH_URL).origin,
      reportId: id,
      sectionKey: key,
    },
  );
}
