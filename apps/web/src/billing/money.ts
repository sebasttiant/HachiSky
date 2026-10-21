import type { Currency } from "./validation.ts";

// Money is stored and added as integer minor units: whole pesos for COP and
// cents for USD (owner, 2026-10-01). Nothing is ever rounded: an amount with
// more decimals than its currency allows is refused, never adjusted.
//
// Amounts are typed in Colombian format: "." groups thousands and "," marks
// decimals ("1.234.567" pesos, "1.234,56" dollars). "1234.56" is refused with
// a hint instead of being guessed (writer assumption, owner to confirm).

export const CURRENCY_DECIMALS: Record<Currency, number> = { COP: 0, USD: 2 };

const MAX_AMOUNT_MAJOR = 999_999_999_999;

export const MAX_AMOUNT_MINOR: Record<Currency, number> = {
  COP: MAX_AMOUNT_MAJOR,
  USD: MAX_AMOUNT_MAJOR * 100 + 99,
};

const CURRENCY_PREFIX: Record<Currency, string> = { COP: "$", USD: "US$" };

const FORMAT_HINT: Record<Currency, string> = {
  COP: "Escribe el valor solo con números y puntos de miles (por ejemplo 1.234.567).",
  USD: "Usa coma para los decimales y punto para los miles (por ejemplo 1.234,56).",
};

// Whole part as plain digits or grouped by "." in threes, then an optional
// "," with decimals. ASCII digits only.
const AMOUNT = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/;

export type AmountParse =
  | { ok: true; minor: number }
  | { ok: false; error: string };

export function parseAmount(input: string, currency: Currency): AmountParse {
  const cleaned = input
    .replace(/\s+/g, "")
    .replace(/^(?:US\$|USD|COP|\$)/i, "");
  if (cleaned === "") return { ok: false, error: "Escribe el valor." };

  const match = AMOUNT.exec(cleaned);
  if (!match) return { ok: false, error: FORMAT_HINT[currency] };
  const [, whole = "", fraction = ""] = match;

  const decimals = CURRENCY_DECIMALS[currency];
  if (fraction && decimals === 0) {
    return { ok: false, error: "Los pesos colombianos no llevan decimales." };
  }
  if (fraction.length > decimals) {
    return {
      ok: false,
      error: `Los dólares admiten máximo ${decimals} decimales.`,
    };
  }

  const digits = whole.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (digits.length > String(MAX_AMOUNT_MAJOR).length) {
    return { ok: false, error: "El valor máximo es 999.999.999.999." };
  }
  const major = Number(digits);
  if (major > MAX_AMOUNT_MAJOR) {
    return { ok: false, error: "El valor máximo es 999.999.999.999." };
  }
  const minor =
    major * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  if (minor <= 0) {
    return { ok: false, error: "El valor debe ser mayor que cero." };
  }
  return { ok: true, minor };
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// The amount as the form reads it back: "1.234.567" or "1.234,56".
export function formatAmountInput(minor: number, currency: Currency): string {
  const decimals = CURRENCY_DECIMALS[currency];
  const scale = 10 ** decimals;
  const major = groupThousands(String(Math.trunc(minor / scale)));
  if (decimals === 0) return major;
  const fraction = String(minor % scale).padStart(decimals, "0");
  return `${major},${fraction}`;
}

// The amount as shown on screen and on the document: "$ 1.234.567" or
// "US$ 1.234,56".
export function formatAmount(minor: number, currency: Currency): string {
  return `${CURRENCY_PREFIX[currency]} ${formatAmountInput(minor, currency)}`;
}

export function sumAmounts(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("amount total exceeds the safe integer range");
    }
  }
  return total;
}
