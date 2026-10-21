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
import { parseAmount } from "./money.ts";

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
export const DECLARATION_LABEL_MAX = 120;
export const DECLARATION_BODY_MAX = 2000;

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
  // The issuer the account belongs to. Only its shape is checked here; the
  // service checks that it exists and is active.
  issuerProfileId: string;
}

export interface SignerInput {
  fullName: string;
  identificationType: IdentificationType;
  identificationNumber: string;
  jobTitle: string;
  email: string;
}

// A tax declaration text. `label` names it in lists and pickers; `body` is
// the text printed on the document.
export interface DeclarationInput {
  label: string;
  body: string;
}

export type IssuerField = keyof IssuerInput;
export type DeclarationField = keyof DeclarationInput;
export type DeclarationFieldErrors = Partial<Record<DeclarationField, string>>;
export type DeclarationValidation =
  | { ok: true; data: DeclarationInput }
  | { ok: false; fieldErrors: DeclarationFieldErrors };
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

  const issuerProfileId = text(input.issuerProfileId).toLowerCase();
  if (!UUID.test(issuerProfileId))
    errors.issuerProfileId = "Elige el emisor de la cuenta.";

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
      issuerProfileId,
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

// The body keeps its line breaks (normalized to \n) because the printed
// document shows the text as written.
export function validateDeclaration(raw: unknown): DeclarationValidation {
  const input = asRecord(raw);
  const errors: DeclarationFieldErrors = {};

  const label = line(input.label);
  if (!label) errors.label = "Escribe un nombre para la declaración.";
  else if (label.length > DECLARATION_LABEL_MAX)
    errors.label = `El nombre es demasiado largo (máximo ${DECLARATION_LABEL_MAX} caracteres).`;

  const body = text(input.body).replace(/\r\n?/g, "\n");
  if (!body) errors.body = "Escribe el texto de la declaración.";
  else if (body.length > DECLARATION_BODY_MAX)
    errors.body = `El texto es demasiado largo (máximo ${DECLARATION_BODY_MAX} caracteres).`;

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, data: { label, body } };
}

// ---- Drafts (cuentas de cobro) ----------------------------------------------

export const DRAFT_LINES_MAX = 50;
export const LINE_PRODUCT_MAX = 200;
export const LINE_DESCRIPTION_MAX = 1000;
export const LINE_QUANTITY_MAX = 30;

// What starting a draft needs. Everything else is chosen while drafting.
export interface NewDraftInput {
  clientId: string;
  issuerProfileId: string;
  currency: Currency;
}

export interface DraftLineInput {
  product: string;
  description: string | null;
  // Informative only; it never multiplies the amount.
  quantity: string | null;
  amountMinor: number;
}

export interface DraftInput extends NewDraftInput {
  bankAccountId: string | null;
  signerProfileId: string | null;
  declarationTextId: string | null;
  paymentTerms: string | null;
  lines: DraftLineInput[];
}

// Keys are the input field names; line errors use `lines.<row>.<field>`,
// where <row> is the row as the form sent it (blank rows included).
export type DraftFieldErrors = Partial<Record<string, string>>;
export type NewDraftValidation =
  | { ok: true; data: NewDraftInput }
  | { ok: false; fieldErrors: DraftFieldErrors };
export type DraftValidation =
  | { ok: true; data: DraftInput }
  | { ok: false; fieldErrors: DraftFieldErrors };

function multiline(value: unknown): string {
  return text(value).replace(/\r\n?/g, "\n");
}

function requiredId(
  value: unknown,
  field: string,
  message: string,
  errors: DraftFieldErrors,
): string {
  const id = text(value).toLowerCase();
  if (!UUID.test(id)) errors[field] = message;
  return id;
}

// Empty means "not chosen yet"; anything else must look like an id. Whether
// the row exists and is active is the service's check.
function optionalId(
  value: unknown,
  field: string,
  message: string,
  errors: DraftFieldErrors,
): string | null {
  const id = text(value).toLowerCase();
  if (!id) return null;
  if (!UUID.test(id)) errors[field] = message;
  return id;
}

export const DRAFT_MESSAGES = {
  clientId: "Elige un cliente activo.",
  issuerProfileId: "Elige un emisor activo.",
  currency: "Elige la moneda: pesos (COP) o dólares (USD).",
  bankAccountId: "Elige una cuenta bancaria activa.",
  bankAccountIssuer: "La cuenta bancaria debe ser del emisor elegido.",
  bankAccountCurrency:
    "La cuenta bancaria debe estar en la moneda del documento.",
  signerProfileId: "Elige un firmante activo.",
  declarationTextId: "Elige una declaración activa.",
} as const;

export function validateNewDraft(raw: unknown): NewDraftValidation {
  const input = asRecord(raw);
  const errors: DraftFieldErrors = {};
  const clientId = requiredId(
    input.clientId,
    "clientId",
    DRAFT_MESSAGES.clientId,
    errors,
  );
  const issuerProfileId = requiredId(
    input.issuerProfileId,
    "issuerProfileId",
    DRAFT_MESSAGES.issuerProfileId,
    errors,
  );
  const currency = input.currency;
  if (!isCurrency(currency)) errors.currency = DRAFT_MESSAGES.currency;
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: { clientId, issuerProfileId, currency: currency as Currency },
  };
}

function isBlankLine(line: Record<string, unknown>): boolean {
  return ["product", "description", "quantity", "amount"].every(
    (field) => text(line[field]) === "",
  );
}

function validateLine(
  fields: Record<string, unknown>,
  row: number,
  currency: Currency | null,
  errors: DraftFieldErrors,
): DraftLineInput {
  const prefix = `lines.${row}`;
  const product = line(fields.product);
  if (!product) errors[`${prefix}.product`] = "Escribe el producto.";
  else if (product.length > LINE_PRODUCT_MAX)
    errors[`${prefix}.product`] =
      `El producto es demasiado largo (máximo ${LINE_PRODUCT_MAX} caracteres).`;

  const description = multiline(fields.description) || null;
  if (description && description.length > LINE_DESCRIPTION_MAX)
    errors[`${prefix}.description`] =
      `La descripción es demasiado larga (máximo ${LINE_DESCRIPTION_MAX} caracteres).`;

  const quantity = line(fields.quantity) || null;
  if (quantity && quantity.length > LINE_QUANTITY_MAX)
    errors[`${prefix}.quantity`] =
      `La cantidad es demasiado larga (máximo ${LINE_QUANTITY_MAX} caracteres).`;

  let amountMinor = 0;
  // Without a valid currency the amount cannot be read; the currency error
  // is reported instead.
  if (currency) {
    const amount = parseAmount(text(fields.amount), currency);
    if (amount.ok) amountMinor = amount.minor;
    else errors[`${prefix}.amount`] = amount.error;
  }
  return { product, description, quantity, amountMinor };
}

export function validateDraft(raw: unknown): DraftValidation {
  const input = asRecord(raw);
  const start = validateNewDraft(raw);
  const errors: DraftFieldErrors = start.ok ? {} : { ...start.fieldErrors };
  const currency = isCurrency(input.currency) ? input.currency : null;

  const bankAccountId = optionalId(
    input.bankAccountId,
    "bankAccountId",
    DRAFT_MESSAGES.bankAccountId,
    errors,
  );
  const signerProfileId = optionalId(
    input.signerProfileId,
    "signerProfileId",
    DRAFT_MESSAGES.signerProfileId,
    errors,
  );
  const declarationTextId = optionalId(
    input.declarationTextId,
    "declarationTextId",
    DRAFT_MESSAGES.declarationTextId,
    errors,
  );

  const paymentTerms = multiline(input.paymentTerms) || null;
  if (paymentTerms && paymentTerms.length > PAYMENT_TERMS_MAX)
    errors.paymentTerms = `Las condiciones de pago son demasiado largas (máximo ${PAYMENT_TERMS_MAX} caracteres).`;

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines: DraftLineInput[] = [];
  rawLines.forEach((rawLine, row) => {
    const record = asRecord(rawLine);
    if (isBlankLine(record)) return;
    lines.push(validateLine(record, row, currency, errors));
  });
  if (lines.length > DRAFT_LINES_MAX)
    errors.lines = `Una cuenta de cobro admite máximo ${DRAFT_LINES_MAX} líneas.`;

  if (!start.ok || Object.keys(errors).length > 0)
    return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      ...start.data,
      bankAccountId,
      signerProfileId,
      declarationTextId,
      paymentTerms,
      lines,
    },
  };
}
