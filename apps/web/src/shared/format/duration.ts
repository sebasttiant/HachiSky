import { APP_LOCALE } from "./date.ts";

const hours = new Intl.NumberFormat(APP_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assertMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError("minutes must be a non-negative integer");
  }
}

// "2 h 30 min", "1 h", "45 min".
export function formatDuration(minutes: number): string {
  assertMinutes(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Decimal hours in es-CO, e.g. 90 -> "1,50", 90000 -> "1.500,00".
export function formatHoursDecimal(minutes: number): string {
  assertMinutes(minutes);
  return hours.format(minutes / 60);
}
