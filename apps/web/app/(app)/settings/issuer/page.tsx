import { redirect } from "next/navigation";
import { requireModule } from "../../../../src/auth/guard.ts";
import { ISSUERS_PATH } from "../../../../src/billing/paths.ts";

// The single-issuer page became the issuer list (several issuer profiles).
// Kept as a guarded redirect so old links and bookmarks still work.
export default async function IssuerSettingsPage() {
  await requireModule("settings", "/settings/issuer");
  redirect(ISSUERS_PATH);
}
