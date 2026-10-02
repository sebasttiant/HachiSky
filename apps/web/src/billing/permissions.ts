import type { RoleName } from "../auth/session.ts";

// Billing settings (issuer and its logo, bank accounts, default payment
// terms, signer profiles and their signature images) are for
// administrators only (owner, 2026-10-01); reading them is admin-only too.
// The service checks this on every call; the UI only mirrors it.
export type BillingSettingsOperation =
  | "view_issuer"
  | "save_issuer"
  | "view_bank_accounts"
  | "create_bank_account"
  | "edit_bank_account"
  | "deactivate_bank_account"
  | "reactivate_bank_account"
  | "view_signers"
  | "create_signer"
  | "edit_signer"
  | "deactivate_signer"
  | "reactivate_signer"
  | "upload_signature"
  | "upload_issuer_logo"
  | "view_images";

export const BILLING_SETTINGS_PERMISSIONS: Record<
  BillingSettingsOperation,
  readonly RoleName[]
> = {
  view_issuer: ["admin"],
  save_issuer: ["admin"],
  view_bank_accounts: ["admin"],
  create_bank_account: ["admin"],
  edit_bank_account: ["admin"],
  deactivate_bank_account: ["admin"],
  reactivate_bank_account: ["admin"],
  view_signers: ["admin"],
  create_signer: ["admin"],
  edit_signer: ["admin"],
  deactivate_signer: ["admin"],
  reactivate_signer: ["admin"],
  upload_signature: ["admin"],
  upload_issuer_logo: ["admin"],
  view_images: ["admin"],
};

export function canPerformBillingSettingsOperation(
  role: unknown,
  operation: BillingSettingsOperation,
): boolean {
  return (
    typeof role === "string" &&
    (BILLING_SETTINGS_PERMISSIONS[operation] as readonly string[]).includes(
      role,
    )
  );
}
