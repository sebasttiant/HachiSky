import { ROLE_NAMES } from "../auth/access-control.ts";
import type { RoleName } from "../auth/session.ts";
import type { UserStatus } from "./service.ts";

// The one place that reads and writes the user list's URL. The page parses
// with it, the links and the filter form write with it. Anything invalid is
// dropped and falls back to the default: a hand-edited URL never breaks the
// page.

export interface UserListFilters {
  q?: string;
  role?: RoleName;
  status?: UserStatus;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const USERS_PATH = "/settings/users";
const STATUSES: readonly UserStatus[] = ["active", "inactive"];
const MAX_QUERY = 100;
const MAX_PAGE = 1000;

// A repeated parameter cannot tell which value was meant; drop it.
function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseUserFilters(params: RawSearchParams): UserListFilters {
  const filters: UserListFilters = { page: 1 };
  const q = single(params.q)?.trim().replace(/\s+/g, " ");
  if (q && q.length <= MAX_QUERY) filters.q = q;
  const role = single(params.role);
  if (ROLE_NAMES.includes(role as RoleName)) filters.role = role as RoleName;
  const status = single(params.status);
  if (STATUSES.includes(status as UserStatus)) {
    filters.status = status as UserStatus;
  }
  const page = single(params.page);
  if (page && /^\d{1,4}$/.test(page)) {
    const n = Number(page);
    if (n >= 1 && n <= MAX_PAGE) filters.page = n;
  }
  return filters;
}

// Changing any filter goes back to page 1: a page number only means
// something inside the result set it was taken from.
export function usersHref(
  current: UserListFilters,
  changes: Partial<UserListFilters>,
): string {
  const next: UserListFilters = {
    ...current,
    ...changes,
    page: Object.hasOwn(changes, "page") ? (changes.page ?? 1) : 1,
  };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.role) params.set("role", next.role);
  if (next.status) params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${USERS_PATH}?${query}` : USERS_PATH;
}

export function hasSearchFilters(filters: UserListFilters): boolean {
  return Boolean(filters.q || filters.role || filters.status);
}
