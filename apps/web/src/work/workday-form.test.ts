import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleWorkday } from "./sample-workday.ts";
import { canSubmit, workdayForm } from "./workday-form.ts";

describe("workday form preview", () => {
  it("cannot be submitted: no action, no submit target, disabled button", () => {
    assert.equal(workdayForm.action, null);
    assert.equal(workdayForm.container, "group");
    assert.equal(workdayForm.submit.disabled, true);
    assert.equal(canSubmit(workdayForm), false);
    assert.match(workdayForm.submit.label, /no disponible/i);
  });

  it("canSubmit only ever returns true for a fully enabled, action-bound form", () => {
    assert.equal(
      canSubmit({
        ...workdayForm,
        action: "/x",
        submit: { ...workdayForm.submit, disabled: false },
      }),
      true,
    );
    assert.equal(canSubmit({ ...workdayForm, action: "/x" }), false);
    assert.equal(
      canSubmit({
        ...workdayForm,
        submit: { ...workdayForm.submit, disabled: false },
      }),
      false,
    );
  });

  it("binds every field to a unique id with a visible label", () => {
    const ids = workdayForm.fields.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const f of workdayForm.fields) {
      assert.ok(f.label.length > 0, `${f.id} lacks label`);
    }
  });

  it("uses fictitious, flagged sample data", () => {
    assert.equal(sampleWorkday.isSample, true);
    for (const c of sampleWorkday.clients) assert.match(c.name, /ejemplo/i);
    assert.ok(sampleWorkday.activities.length >= 2);
  });
});
