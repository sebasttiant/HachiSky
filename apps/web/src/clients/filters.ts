import type { ClientFilters } from "./service.ts";

// The one place that reads and writes the client list's URL. Anything invalid
// is dropped and falls back to the default (active clients, first page), so a
// hand-edited URL never breaks the page.

export type StatusFilter = "active" | "inactive" | "all";

export interface ClientListFilters {
  q?: string;
  status: StatusFilter;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const CLIENTS_PATH = "/clients";
export const DEFAULT_STATUS: StatusFilter = "active";
const STATUSES: readonly StatusFilter[] = ["active", "inactive", "all"];
const MAX_QUERY = 100;
const MAX_PAGE = 1000;

// A repeated parameter cannot tell which value was meant; drop it.
function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseClientFilters(params: RawSearchParams): ClientListFilters {
  const filters: ClientListFilters = { status: DEFAULT_STATUS, page: 1 };
  const q = single(params.q)?.trim().replace(/\s+/g, " ");
  if (q && q.length <= MAX_QUERY) filters.q = q;
  const status = single(params.status);
  if (STATUSES.includes(status as StatusFilter)) {
    filters.status = status as StatusFilter;
  }
  const page = single(params.page);
  if (page && /^\d{1,4}$/.test(page)) {
    const n = Number(page);
    if (n >= 1 && n <= MAX_PAGE) filters.page = n;
  }
  return filters;
}

// Changing any filter goes back to page 1.
export function clientsHref(
  current: ClientListFilters,
  changes: Partial<ClientListFilters>,
): string {
  const next: ClientListFilters = {
    ...current,
    ...changes,
    page: Object.hasOwn(changes, "page") ? (changes.page ?? 1) : 1,
  };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== DEFAULT_STATUS) params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${CLIENTS_PATH}?${query}` : CLIENTS_PATH;
}

export function hasSearchFilters(filters: ClientListFilters): boolean {
  return Boolean(filters.q) || filters.status !== DEFAULT_STATUS;
}

export function toServiceFilters(filters: ClientListFilters): ClientFilters {
  return {
    q: filters.q,
    status: filters.status === "all" ? undefined : filters.status,
    page: filters.page,
  };
}
