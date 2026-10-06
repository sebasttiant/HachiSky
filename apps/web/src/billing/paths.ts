// Routes of the billing settings screens (Configuración, administrators only).
export const SETTINGS_PATH = "/settings";
export const ISSUERS_PATH = `${SETTINGS_PATH}/issuers`;
export const NEW_ISSUER_PATH = `${ISSUERS_PATH}/new`;

export function issuerPath(id: string): string {
  return `${ISSUERS_PATH}/${encodeURIComponent(id)}`;
}
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
export function issuerLogoUploadPath(id: string): string {
  return `/api/billing/uploads/issuers/${encodeURIComponent(id)}/logo`;
}

export function signerSignatureUploadPath(id: string): string {
  return `/api/billing/uploads/signers/${encodeURIComponent(id)}/signature`;
}

// Protected route that serves one stored image version (admins only).
export function billingImagePath(id: string): string {
  return `/api/billing/images/${encodeURIComponent(id)}`;
}
