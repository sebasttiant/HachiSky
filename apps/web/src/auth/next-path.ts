// Post-login return target. Only same-origin paths are accepted; anything
// else falls back to the home page, so `/login?next=...` cannot become an
// open redirect.

const FALLBACK = "/";
const MAX_LENGTH = 2048;
// Any origin works: the check is that resolving the value against it keeps
// the same origin. `.invalid` can never be a real host.
const PROBE_ORIGIN = "http://hachisky.invalid";

// Control characters (browsers strip tab/CR/LF from URLs, which can turn
// `/\t/evil` into `//evil`) and backslashes (treated as `/` by browsers).
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
const FORBIDDEN = /[\u0000-\u001f\u007f\\]/;

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_LENGTH) return FALLBACK;
  if (!value.startsWith("/") || value.startsWith("//")) return FALLBACK;
  if (FORBIDDEN.test(value)) return FALLBACK;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return FALLBACK;
  }
  // Dot-segment normalization can turn an internal input into `//host`.
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith("//")) {
    return FALLBACK;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

// Sign-in page URL that returns to `currentPath` afterwards.
export function loginPath(currentPath: string): string {
  const next = safeNextPath(currentPath);
  return next === FALLBACK
    ? "/login"
    : `/login?next=${encodeURIComponent(next)}`;
}
