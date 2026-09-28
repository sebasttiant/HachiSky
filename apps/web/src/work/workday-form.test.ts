import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleWorkday } from "./sample-workday.ts";
import { parseMinutes, totalMinutes, workdayForm } from "./workday-form.ts";

describe("workday form model", () => {
  it("keeps the save action disabled with an explanatory label", () => {
    assert.equal(workdayForm.submit.disabled, true);
    assert.match(workdayForm.submit.label, /no disponible/i);
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

describe("parseMinutes", () => {
  it("reads whole non-negative numbers", () => {
    assert.equal(parseMinutes("90"), 90);
    assert.equal(parseMinutes(" 45 "), 45);
    assert.equal(parseMinutes("0"), 0);
  });

  it("floors decimals", () => {
    assert.equal(parseMinutes("12.9"), 12);
  });

  it("treats empty, blank and non-numeric input as zero", () => {
    assert.equal(parseMinutes(""), 0);
    assert.equal(parseMinutes("   "), 0);
    assert.equal(parseMinutes("abc"), 0);
    assert.equal(parseMinutes("12abc"), 0);
  });

  it("treats negative and non-finite input as zero", () => {
    assert.equal(parseMinutes("-5"), 0);
    assert.equal(parseMinutes("-0.5"), 0);
    assert.equal(parseMinutes("Infinity"), 0);
    assert.equal(parseMinutes("1e999"), 0);
    assert.equal(parseMinutes("NaN"), 0);
  });
});

describe("totalMinutes", () => {
  it("sums the sample activities", () => {
    assert.equal(
      totalMinutes(sampleWorkday.activities.map((a) => String(a.minutes))),
      240,
    );
  });

  it("recomputes from edited values and ignores invalid or negative ones", () => {
    assert.equal(totalMinutes(["60", "", "abc", "-30", "15"]), 75);
  });

  it("is zero for no activities", () => {
    assert.equal(totalMinutes([]), 0);
  });
});
