import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHANGE_PASSWORD_PATH, passwordGateRedirect } from "./password-gate.ts";

describe("passwordGateRedirect", () => {
  it("lets users without a pending change through", () => {
    assert.equal(passwordGateRedirect(false, "/settings/users"), null);
  });

  it("sends a user with a pending change to the change page, remembering where they were going", () => {
    assert.equal(
      passwordGateRedirect(true, "/settings/users"),
      `${CHANGE_PASSWORD_PATH}?next=%2Fsettings%2Fusers`,
    );
    assert.equal(passwordGateRedirect(true, "/"), CHANGE_PASSWORD_PATH);
  });

  it("never redirects the change page to itself", () => {
    assert.equal(passwordGateRedirect(true, CHANGE_PASSWORD_PATH), null);
  });

  it("drops a return target that is not a same-origin path", () => {
    assert.equal(
      passwordGateRedirect(true, "//evil.example/x"),
      CHANGE_PASSWORD_PATH,
    );
  });
});
