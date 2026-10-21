import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientsHref,
  hasSearchFilters,
  parseClientFilters,
  toServiceFilters,
} from "./filters.ts";

describe("parseClientFilters", () => {
  it("defaults to active clients on the first page", () => {
    assert.deepEqual(parseClientFilters({}), { status: "active", page: 1 });
  });

  it("reads the query, status and page", () => {
    assert.deepEqual(
      parseClientFilters({ q: "  demo   uno ", status: "inactive", page: "3" }),
      { q: "demo uno", status: "inactive", page: 3 },
    );
    assert.equal(parseClientFilters({ status: "all" }).status, "all");
  });

  it("drops invalid, repeated or out-of-range values", () => {
    assert.deepEqual(
      parseClientFilters({ q: ["a", "b"], status: "deleted", page: "0" }),
      { status: "active", page: 1 },
    );
    assert.equal(parseClientFilters({ page: "-2" }).page, 1);
    assert.equal(parseClientFilters({ page: "99999" }).page, 1);
    assert.equal(parseClientFilters({ q: "x".repeat(101) }).q, undefined);
  });
});

describe("clientsHref", () => {
  const current = { q: "demo", status: "inactive" as const, page: 4 };

  it("drops pagination when a filter changes", () => {
    assert.equal(
      clientsHref(current, { status: "all" }),
      "/clients?q=demo&status=all",
    );
  });

  it("keeps the page only when it is the change", () => {
    assert.equal(
      clientsHref(current, { page: 5 }),
      "/clients?q=demo&status=inactive&page=5",
    );
  });

  it("omits the default status", () => {
    assert.equal(clientsHref({ status: "active", page: 1 }, {}), "/clients");
  });
});

describe("filters helpers", () => {
  it("treats the default view as unfiltered", () => {
    assert.equal(hasSearchFilters({ status: "active", page: 1 }), false);
    assert.equal(hasSearchFilters({ status: "all", page: 1 }), true);
    assert.equal(hasSearchFilters({ q: "a", status: "active", page: 1 }), true);
  });

  it("maps 'all' to no status filter for the service", () => {
    assert.deepEqual(toServiceFilters({ status: "all", page: 2 }), {
      q: undefined,
      status: undefined,
      page: 2,
    });
    assert.equal(
      toServiceFilters({ status: "inactive", page: 1 }).status,
      "inactive",
    );
  });
});
