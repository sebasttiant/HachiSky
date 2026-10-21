import { checkModuleAccess } from "../../../../../../../src/auth/guard.ts";
import {
  billingActorFrom,
  handleBillingImageUpload,
} from "../../../../../../../src/billing/image-upload.ts";
import { getDb } from "../../../../../../../src/db/client.ts";
import { loadAuthEnv } from "../../../../../../../src/shared/config/env.ts";

// Uploads a new signature version for one signer: raw PNG/JPEG body,
// administrators only, same-origin only, 1 MB limit enforced before and
// while reading the body. Answers JSON with Spanish messages (see
// src/billing/image-upload.ts).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const access = await checkModuleAccess("settings", `/api/billing/uploads/signers/${id}/signature`);
  return handleBillingImageUpload(
    { db: getDb() },
    {
      request,
      access: billingActorFrom(access, request.headers),
      appOrigin: new URL(loadAuthEnv().BETTER_AUTH_URL).origin,
      target: { kind: "signature", signerId: id },
    },
  );
}
