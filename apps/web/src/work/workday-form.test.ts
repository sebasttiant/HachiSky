import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration } from "../shared/format/duration.ts";
import { sampleWorkday } from "./sample-workday.ts";
import {
  MAX_ACTIVITY_MINUTES,
  parseMinutes,
  totalMinutes,
  workdayForm,
} from "./workday-form.ts";

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

describe("parseMinutes limits", () => {
  it("caps a single activity at one day", () => {
    assert.equal(MAX_ACTIVITY_MINUTES, 1440);
    assert.equal(parseMinutes("1440"), 1440);
    assert.equal(parseMinutes("1441"), 0);
    assert.equal(parseMinutes("1440.9"), 1440);
    assert.equal(parseMinutes("1441.0"), 0);
    assert.equal(parseMinutes("999999999999999999999"), 0);
  });

  it("rejects exponent notation that exceeds the cap", () => {
    assert.equal(parseMinutes("1e308"), 0);
    assert.equal(parseMinutes("1e20"), 0);
  });

  it("accepts only plain decimal numbers, not hex, binary or signed forms", () => {
    assert.equal(parseMinutes("0x10"), 0);
    assert.equal(parseMinutes("0b11"), 0);
    assert.equal(parseMinutes("0o7"), 0);
    assert.equal(parseMinutes("+5"), 0);
    assert.equal(parseMinutes("1e2"), 0);
    assert.equal(parseMinutes("12."), 0);
    assert.equal(parseMinutes(".5"), 0);
    assert.equal(parseMinutes("007"), 7);
  });
});

describe("totalMinutes", () => {
  it("stays finite and renderable with huge entries", () => {
    const total = totalMinutes(["1e308", "1e308"]);
    assert.equal(total, 0);
    assert.doesNotThrow(() => formatDuration(total));
    const many = totalMinutes(["1440", "1440", "1440", "1441", "0x10"]);
    assert.equal(many, 4320);
    assert.doesNotThrow(() => formatDuration(many));
  });

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
