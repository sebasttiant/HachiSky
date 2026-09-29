import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, formatHoursDecimal } from "./duration.ts";

describe("formatDuration", () => {
  it("formats minutes in Spanish", () => {
    assert.equal(formatDuration(45), "45 min");
    assert.equal(formatDuration(60), "1 h");
    assert.equal(formatDuration(150), "2 h 30 min");
    assert.equal(formatDuration(0), "0 min");
  });

  it("rejects negative or fractional minutes", () => {
    assert.throws(() => formatDuration(-1), RangeError);
    assert.throws(() => formatDuration(1.5), RangeError);
  });
});

describe("formatHoursDecimal", () => {
  it("renders hours with a decimal comma and two decimals", () => {
    assert.equal(formatHoursDecimal(90), "1,50");
    assert.equal(formatHoursDecimal(45), "0,75");
    assert.equal(formatHoursDecimal(100), "1,67");
    assert.equal(formatHoursDecimal(555), "9,25");
  });

  it("uses es-CO thousands separators (dot) for large totals", () => {
    assert.equal(formatHoursDecimal(90000), "1.500,00");
  });
});
