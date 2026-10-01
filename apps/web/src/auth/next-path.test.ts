import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginPath, safeNextPath } from "./next-path.ts";

describe("safeNextPath", () => {
  it("rejects leading double slashes produced by dot-segment normalization", () => {
    for (const path of [
      "/a/..//evil.example",
      "/.//evil.example",
      "/%2e//evil.example",
      "/a/%2e%2e//evil.example",
    ]) {
      assert.equal(safeNextPath(path), "/");
    }
    assert.equal(safeNextPath("/a/../work"), "/work");
  });
  it("keeps internal paths with their query and hash", () => {
    assert.equal(safeNextPath("/work"), "/work");
    assert.equal(safeNextPath("/"), "/");
    assert.equal(
      safeNextPath("/reports?month=2026-09"),
      "/reports?month=2026-09",
    );
    assert.equal(safeNextPath("/work#today"), "/work#today");
    assert.equal(safeNextPath("/a/b/c"), "/a/b/c");
  });

  it("falls back to / for anything that is not a string path", () => {
    for (const value of [undefined, null, 42, ["/work"], {}, ""]) {
      assert.equal(safeNextPath(value), "/", String(value));
    }
  });

  it("rejects absolute and scheme URLs", () => {
    for (const value of [
      "https://evil.example",
      "http://evil.example/work",
      "HTTPS://evil.example",
      "javascript:alert(1)",
      "data:text/html,hi",
      "evil.example",
      "work",
      " /work",
    ]) {
      assert.equal(safeNextPath(value), "/", value);
    }
  });

  it("rejects protocol-relative and backslash forms", () => {
    for (const value of [
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\/evil.example",
      "/\\/evil.example",
      "/work\\..\\..\\evil",
    ]) {
      assert.equal(safeNextPath(value), "/", value);
    }
  });

  it("rejects control characters browsers would strip", () => {
    for (const value of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/work\u0000",
      "/work\u007f",
    ]) {
      assert.equal(safeNextPath(value), "/", JSON.stringify(value));
    }
  });

  it("rejects encoded variants once the query string is decoded", () => {
    // `searchParams.get` decodes once; these are the decoded values an
    // attacker controls.
    for (const encoded of [
      "%2F%2Fevil.example",
      "%2f%2fevil.example",
      "%2F%5Cevil.example",
      "https%3A%2F%2Fevil.example",
      "%2F%09%2Fevil.example",
    ]) {
      const decoded = new URLSearchParams(`next=${encoded}`).get("next");
      assert.equal(safeNextPath(decoded), "/", encoded);
    }
  });

  it("rejects values that are still percent-encoded after decoding", () => {
    // Double encoding: the value starts with `%`, not `/`.
    const decoded = new URLSearchParams("next=%252F%252Fevil.example").get(
      "next",
    );
    assert.equal(decoded, "%2F%2Fevil.example");
    assert.equal(safeNextPath(decoded), "/");
  });

  it("keeps an encoded slash inside a path segment on the same origin", () => {
    assert.equal(safeNextPath("/%2F/evil.example"), "/%2F/evil.example");
  });

  it("rejects overly long values", () => {
    assert.equal(safeNextPath(`/${"a".repeat(2048)}`), "/");
  });
});

describe("loginPath", () => {
  it("omits next for the home page", () => {
    assert.equal(loginPath("/"), "/login");
  });

  it("encodes the requested path", () => {
    assert.equal(loginPath("/work"), "/login?next=%2Fwork");
    assert.equal(
      loginPath("/reports?month=2026-09"),
      "/login?next=%2Freports%3Fmonth%3D2026-09",
    );
  });

  it("drops an unsafe target instead of carrying it", () => {
    assert.equal(loginPath("//evil.example"), "/login");
  });
});
