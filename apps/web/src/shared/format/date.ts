export const APP_LOCALE = "es-CO";
export const APP_TIME_ZONE = "America/Bogota";

const numeric = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const long = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});

const dateTime = new Intl.DateTimeFormat(APP_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

// "29 de sept de 2026, 8:05 p. m." — an instant, always shown in Bogota time.
export function formatDateTime(instant: Date): string {
  return dateTime.format(instant);
}

// Parse a calendar date (yyyy-mm-dd) at noon Bogota time (UTC-5, no DST) so
// formatting in America/Bogota can never shift the day.
function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const date = match ? new Date(`${iso}T12:00:00-05:00`) : null;
  if (
    !match ||
    !date ||
    Number.isNaN(date.getTime()) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return date;
}

// "02/03/2026"
export function formatDate(iso: string): string {
  return numeric.format(parseIsoDate(iso));
}

// "2 de marzo de 2026"
export function formatDateLong(iso: string): string {
  return long.format(parseIsoDate(iso));
}
