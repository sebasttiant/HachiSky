// Routes of the billing settings screens (Configuración, administrators only).
export const SETTINGS_PATH = "/settings";
export const ISSUER_PATH = `${SETTINGS_PATH}/issuer`;
export const BANK_ACCOUNTS_PATH = `${SETTINGS_PATH}/bank-accounts`;
export const NEW_BANK_ACCOUNT_PATH = `${BANK_ACCOUNTS_PATH}/new`;

export function bankAccountPath(id: string): string {
  return `${BANK_ACCOUNTS_PATH}/${encodeURIComponent(id)}`;
}
