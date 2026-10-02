// Routes of the billing settings screens (Configuración, administrators only).
export const SETTINGS_PATH = "/settings";
export const ISSUER_PATH = `${SETTINGS_PATH}/issuer`;
export const BANK_ACCOUNTS_PATH = `${SETTINGS_PATH}/bank-accounts`;
export const NEW_BANK_ACCOUNT_PATH = `${BANK_ACCOUNTS_PATH}/new`;

export function bankAccountPath(id: string): string {
  return `${BANK_ACCOUNTS_PATH}/${encodeURIComponent(id)}`;
}

export const SIGNERS_PATH = `${SETTINGS_PATH}/signers`;
export const NEW_SIGNER_PATH = `${SIGNERS_PATH}/new`;

export function signerPath(id: string): string {
  return `${SIGNERS_PATH}/${encodeURIComponent(id)}`;
}

// Upload route handlers (raw image body, admins only; see image-upload.ts).
export const ISSUER_LOGO_UPLOAD_PATH = "/api/billing/uploads/issuer-logo";

export function signerSignatureUploadPath(id: string): string {
  return `/api/billing/uploads/signers/${encodeURIComponent(id)}/signature`;
}

// Protected route that serves one stored image version (admins only).
export function billingImagePath(id: string): string {
  return `/api/billing/images/${encodeURIComponent(id)}`;
}
