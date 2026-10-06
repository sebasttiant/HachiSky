// Validation and normalization for the billing settings (issuer profiles,
// bank accounts and signers). Pure (no server imports) so the service and the forms share it;
// the service always re-validates.
import {
  checkIdentificationNumber,
  type IdentificationType,
  isIdentificationType,
  isValidEmail,
  isValidPhone,
} from "../clients/validation.ts";

export const ACCOUNT_TYPES = ["ahorros", "corriente"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ahorros: "Ahorros",
  corriente: "Corriente",
};

export const CURRENCIES = ["COP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABEL: Record<Currency, string> = {
  COP: "COP · Pesos colombianos",
  USD: "USD · Dólares estadounidenses",
};

export const PAYMENT_TERMS_MAX = 1000;

// Row ids are uuids; anything else is refused before reaching the database.
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssuerInput {
  legalName: string;
  identificationType: IdentificationType;
  identificationNumber: string;
  address: string;
  city: string;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
}

export interface BankAccountInput {
  bankName: string;
  accountType: AccountType;
  accountNumber: string;
  holderName: string;
  holderIdentificationType: IdentificationType;
  holderIdentificationNumber: string;
  currency: Currency;
}

export interface SignerInput {
  fullName: string;
  identificationType: IdentificationType;
  identificationNumber: string;
  jobTitle: string;
  email: string;
}

export type IssuerField = keyof IssuerInput;
export type SignerField = keyof SignerInput;
export type SignerFieldErrors = Partial<Record<SignerField, string>>;
export type SignerValidation =
  | { ok: true; data: SignerInput }
  | { ok: false; fieldErrors: SignerFieldErrors };
export type BankAccountField = keyof BankAccountInput;
export type IssuerFieldErrors = Partial<Record<IssuerField, string>>;
export type BankAccountFieldErrors = Partial<Record<BankAccountField, string>>;

export type IssuerValidation =
  | { ok: true; data: IssuerInput }
  | { ok: false; fieldErrors: IssuerFieldErrors };
export type BankAccountValidation =
  | { ok: true; data: BankAccountInput }
  | { ok: false; fieldErrors: BankAccountFieldErrors };

const LIMITS = {
  name: 200,
  address: 200,
  city: 100,
  bank: 100,
  jobTitle: 100,
  email: 254,
} as const;

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function line(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}

function optional(value: unknown): string | null {
  return text(value) || null;
}

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === "string" &&
    (ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === "string" &&
    (CURRENCIES as readonly string[]).includes(value)
  );
}

export function validateIssuer(raw: unknown): IssuerValidation {
  const input = asRecord(raw);
  const errors: IssuerFieldErrors = {};

  const legalName = line(input.legalName);
  if (!legalName)
    errors.legalName = "Escribe el nombre o razón social del emisor.";
  else if (legalName.length > LIMITS.name)
    errors.legalName = `El nombre es demasiado largo (máximo ${LIMITS.name} caracteres).`;

  const type = input.identificationType;
  if (!isIdentificationType(type))
    errors.identificationType = "Elige un tipo de identificación.";
  const { number, error: numberError } = checkIdentificationNumber(
    type,
    text(input.identificationNumber),
  );
  if (numberError) errors.identificationNumber = numberError;

  const address = line(input.address);
  if (!address) errors.address = "Escribe la dirección.";
  else if (address.length > LIMITS.address)
    errors.address = `La dirección es demasiado larga (máximo ${LIMITS.address} caracteres).`;

  const city = line(input.city);
  if (!city) errors.city = "Escribe la ciudad.";
  else if (city.length > LIMITS.city)
    errors.city = `La ciudad es demasiado larga (máximo ${LIMITS.city} caracteres).`;

  const phone = optional(input.phone);
  if (phone && !isValidPhone(phone))
    errors.phone = "Escribe un teléfono válido (7 a 15 dígitos).";

  const email = optional(input.email)?.toLowerCase() ?? null;
  if (email && !isValidEmail(email)) errors.email = "Escribe un correo válido.";

  // Line breaks are kept (the terms are printed as written); only the ends
  // are trimmed and CRLF becomes LF so equal text compares equal.
  const paymentTerms =
    optional(input.paymentTerms)?.replace(/\r\n?/g, "\n") ?? null;
  if (paymentTerms && paymentTerms.length > PAYMENT_TERMS_MAX)
    errors.paymentTerms = `Las condiciones de pago son demasiado largas (máximo ${PAYMENT_TERMS_MAX} caracteres).`;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      legalName,
      identificationType: type as IdentificationType,
      identificationNumber: number,
      address,
      city,
      phone,
      email,
      paymentTerms,
    },
  };
}

export function validateBankAccount(raw: unknown): BankAccountValidation {
  const input = asRecord(raw);
  const errors: BankAccountFieldErrors = {};

  const bankName = line(input.bankName);
  if (!bankName) errors.bankName = "Escribe el nombre del banco.";
  else if (bankName.length > LIMITS.bank)
    errors.bankName = `El nombre del banco es demasiado largo (máximo ${LIMITS.bank} caracteres).`;

  const accountType = input.accountType;
  if (!isAccountType(accountType))
    errors.accountType = "Elige el tipo de cuenta.";

  // Stored as digits: spaces and dashes the user typed for readability are
  // dropped; anything else (letters, symbols) is an error, never guessed.
  const accountNumber = text(input.accountNumber).replace(/[\s-]/g, "");
  if (!accountNumber) errors.accountNumber = "Escribe el número de cuenta.";
  else if (!/^\d+$/.test(accountNumber))
    errors.accountNumber = "Usa solo números, sin letras ni símbolos.";
  else if (accountNumber.length < 4 || accountNumber.length > 20)
    errors.accountNumber = "Debe tener entre 4 y 20 dígitos.";

  const holderName = line(input.holderName);
  if (!holderName) errors.holderName = "Escribe el nombre del titular.";
  else if (holderName.length > LIMITS.name)
    errors.holderName = `El nombre del titular es demasiado largo (máximo ${LIMITS.name} caracteres).`;

  const holderType = input.holderIdentificationType;
  if (!isIdentificationType(holderType))
    errors.holderIdentificationType = "Elige un tipo de identificación.";
  const { number: holderNumber, error: holderNumberError } =
    checkIdentificationNumber(
      holderType,
      text(input.holderIdentificationNumber),
    );
  if (holderNumberError) errors.holderIdentificationNumber = holderNumberError;

  const currency = input.currency;
  if (!isCurrency(currency)) errors.currency = "Elige la moneda.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      bankName,
      accountType: accountType as AccountType,
      accountNumber,
      holderName,
      holderIdentificationType: holderType as IdentificationType,
      holderIdentificationNumber: holderNumber,
      currency: currency as Currency,
    },
  };
}

// Every signer field is required: the printed document shows name,
// identification, job title and contact under the signature.
export function validateSigner(raw: unknown): SignerValidation {
  const input = asRecord(raw);
  const errors: SignerFieldErrors = {};

  const fullName = line(input.fullName);
  if (!fullName) errors.fullName = "Escribe el nombre completo del firmante.";
  else if (fullName.length > LIMITS.name)
    errors.fullName = `El nombre es demasiado largo (máximo ${LIMITS.name} caracteres).`;

  const type = input.identificationType;
  if (!isIdentificationType(type))
    errors.identificationType = "Elige un tipo de identificación.";
  const { number, error: numberError } = checkIdentificationNumber(
    type,
    text(input.identificationNumber),
  );
  if (numberError) errors.identificationNumber = numberError;

  const jobTitle = line(input.jobTitle);
  if (!jobTitle) errors.jobTitle = "Escribe el cargo del firmante.";
  else if (jobTitle.length > LIMITS.jobTitle)
    errors.jobTitle = `El cargo es demasiado largo (máximo ${LIMITS.jobTitle} caracteres).`;

  const email = text(input.email).toLowerCase();
  if (!email) errors.email = "Escribe el correo del firmante.";
  else if (email.length > LIMITS.email || !isValidEmail(email))
    errors.email = "Escribe un correo válido.";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      fullName,
      identificationType: type as IdentificationType,
      identificationNumber: number,
      jobTitle,
      email,
    },
  };
}
