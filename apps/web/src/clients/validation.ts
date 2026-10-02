// Client input validation and normalization. Pure (no server imports) so the
// service and any form can share it; the service always re-validates.

export const IDENTIFICATION_TYPES = ["NIT", "CC", "CE", "PP"] as const;
export type IdentificationType = (typeof IDENTIFICATION_TYPES)[number];

export const IDENTIFICATION_TYPE_LABEL: Record<IdentificationType, string> = {
  NIT: "NIT",
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  PP: "Pasaporte",
};

export interface ClientInput {
  name: string;
  identificationType: IdentificationType;
  identificationNumber: string;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
}

export type ClientField = keyof ClientInput;
export type ClientFieldErrors = Partial<Record<ClientField, string>>;

export type ClientValidation =
  | { ok: true; data: ClientInput }
  | { ok: false; fieldErrors: ClientFieldErrors };

const LIMITS = { name: 200, address: 200, city: 100 } as const;

export function isIdentificationType(
  value: unknown,
): value is IdentificationType {
  return (
    typeof value === "string" &&
    (IDENTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

// NIT and CC are numeric: whitespace, dots, commas and dashes are separators.
// CE and PP may hold letters: trimmed, upper-cased, spaces and dashes dropped.
export function normalizeIdentificationNumber(
  type: string,
  raw: string,
): string {
  if (type === "NIT" || type === "CC") return raw.replace(/[\s.,-]/g, "");
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  return text(value) || null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

// Shared with the billing settings (issuer and bank account holders).
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX && EMAIL.test(email);
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "").length;
  return /^\+?[\d\s().-]+$/.test(phone) && digits >= 7 && digits <= 15;
}

// Normalizes a raw identification number for its type and explains why it is
// not acceptable (null when it is). `type` may be anything the caller got.
export function checkIdentificationNumber(
  type: unknown,
  raw: string,
): { number: string; error: string | null } {
  const number = isIdentificationType(type)
    ? normalizeIdentificationNumber(type, raw)
    : raw;
  if (!number) return { number, error: "Escribe el número de identificación." };
  if (type === "NIT" || type === "CC") {
    if (!/^\d+$/.test(number))
      return { number, error: "Usa solo números, sin letras ni símbolos." };
    if (number.length < 5 || number.length > 15)
      return { number, error: "Debe tener entre 5 y 15 dígitos." };
  } else if (type === "CE" || type === "PP") {
    if (!/^[A-Z0-9]{4,20}$/.test(number))
      return {
        number,
        error: "Usa solo letras y números (entre 4 y 20 caracteres).",
      };
  }
  return { number, error: null };
}

export function validateClient(raw: unknown): ClientValidation {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const errors: ClientFieldErrors = {};

  const name = text(input.name).replace(/\s+/g, " ");
  if (!name) errors.name = "Escribe el nombre o razón social.";
  else if (name.length > LIMITS.name)
    errors.name = `El nombre es demasiado largo (máximo ${LIMITS.name} caracteres).`;

  const type = input.identificationType;
  if (!isIdentificationType(type))
    errors.identificationType = "Elige un tipo de identificación.";

  const { number, error: numberError } = checkIdentificationNumber(
    type,
    text(input.identificationNumber),
  );
  if (numberError) errors.identificationNumber = numberError;

  const address = optional(input.address);
  if (address && address.length > LIMITS.address)
    errors.address = `La dirección es demasiado larga (máximo ${LIMITS.address} caracteres).`;

  const city = optional(input.city);
  if (city && city.length > LIMITS.city)
    errors.city = `La ciudad es demasiado larga (máximo ${LIMITS.city} caracteres).`;

  const email = optional(input.email)?.toLowerCase() ?? null;
  if (email && !isValidEmail(email)) errors.email = "Escribe un correo válido.";

  const phone = optional(input.phone);
  if (phone && !isValidPhone(phone))
    errors.phone = "Escribe un teléfono válido (7 a 15 dígitos).";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      name,
      identificationType: type as IdentificationType,
      identificationNumber: number,
      address,
      city,
      email,
      phone,
    },
  };
}
