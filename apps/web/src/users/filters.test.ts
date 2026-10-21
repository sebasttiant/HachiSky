import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSearchFilters, parseUserFilters, usersHref } from "./filters.ts";

describe("parseUserFilters", () => {
  it("defaults to the first page with no filters", () => {
    assert.deepEqual(parseUserFilters({}), { page: 1 });
  });

  it("keeps valid values and normalizes the search text", () => {
    assert.deepEqual(
      parseUserFilters({
        q: "  ana   maría ",
        role: "staff",
        status: "inactive",
        page: "3",
      }),
      { q: "ana maría", role: "staff", status: "inactive", page: 3 },
    );
  });

  it("drops anything invalid instead of failing", () => {
    assert.deepEqual(
      parseUserFilters({
        q: "   ",
        role: "user",
        status: "all",
        page: "-2",
      }),
      { page: 1 },
    );
    assert.deepEqual(parseUserFilters({ page: "1e3" }), { page: 1 });
    assert.deepEqual(parseUserFilters({ q: "x".repeat(101) }), { page: 1 });
  });

  it("ignores repeated parameters rather than guessing", () => {
    assert.deepEqual(parseUserFilters({ role: ["admin", "staff"] }), {
      page: 1,
    });
  });
});

describe("usersHref", () => {
  it("writes a stable query and omits defaults", () => {
    assert.equal(usersHref({ page: 1 }, {}), "/settings/users");
    assert.equal(
      usersHref({ page: 1 }, { status: "active", q: "ana", role: "admin" }),
      "/settings/users?q=ana&role=admin&status=active",
    );
  });

  it("goes back to page 1 when a filter changes, keeps it when paging", () => {
    const current = { q: "ana", page: 3 };
    assert.equal(
      usersHref(current, { role: "staff" }),
      "/settings/users?q=ana&role=staff",
    );
    assert.equal(
      usersHref(current, { page: 4 }),
      "/settings/users?q=ana&page=4",
    );
  });
});

describe("hasSearchFilters", () => {
  it("is true only when text, role or status narrow the list", () => {
    assert.equal(hasSearchFilters({ page: 2 }), false);
    assert.equal(hasSearchFilters({ page: 1, status: "active" }), true);
  });
});
