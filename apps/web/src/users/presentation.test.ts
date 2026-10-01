import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_NAMES } from "../auth/access-control.ts";
import { TEMPORARY_PASSWORD_MIN } from "./forms.ts";
import {
  actionLabel,
  generateTemporaryPassword,
  ROLE_LABEL,
} from "./presentation.ts";

describe("labels", () => {
  it("names every role in Spanish", () => {
    for (const role of ROLE_NAMES) assert.ok(ROLE_LABEL[role]);
    assert.equal(ROLE_LABEL.admin, "Administrador");
  });

  it("describes known audit actions and falls back for unknown ones", () => {
    assert.equal(actionLabel("user.deactivate"), "Desactivó la cuenta");
    assert.equal(actionLabel("user.future_thing"), "user.future_thing");
    assert.equal(
      actionLabel("user.deactivate.requested"),
      "Desactivó la cuenta (sin confirmar)",
    );
  });
});

describe("generateTemporaryPassword", () => {
  it("is long enough, readable and different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const password = generateTemporaryPassword();
      assert.ok(password.length >= TEMPORARY_PASSWORD_MIN);
      assert.match(
        password,
        /^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/,
      );
      seen.add(password);
    }
    assert.equal(seen.size, 50);
  });
});
