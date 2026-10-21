import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAmount,
  formatAmountInput,
  MAX_AMOUNT_MINOR,
  parseAmount,
  sumAmounts,
} from "./money.ts";

function minor(input: string, currency: "COP" | "USD") {
  const result = parseAmount(input, currency);
  assert.ok(result.ok, `${input}: ${!result.ok && result.error}`);
  return result.ok ? result.minor : -1;
}

function error(input: string, currency: "COP" | "USD") {
  const result = parseAmount(input, currency);
  assert.equal(result.ok, false, `${input} should be refused`);
  return result.ok ? "" : result.error;
}

describe("parseAmount in COP (whole pesos)", () => {
  it("reads plain digits and Colombian thousands separators", () => {
    assert.equal(minor("1234567", "COP"), 1_234_567);
    assert.equal(minor("1.234.567", "COP"), 1_234_567);
    assert.equal(minor(" $ 1.234.567 ", "COP"), 1_234_567);
    assert.equal(minor("COP 500", "COP"), 500);
    assert.equal(minor("1 234 567", "COP"), 1_234_567);
    assert.equal(minor("1", "COP"), 1);
  });

  it("refuses decimals instead of rounding them", () => {
    assert.match(error("1.234,50", "COP"), /no llevan decimales/);
    assert.match(error("10,0", "COP"), /no llevan decimales/);
  });

  it("refuses ambiguous or malformed numbers with a hint", () => {
    for (const input of [
      "1234.5",
      "1.23",
      "12.3456",
      "1..000",
      ".500",
      "1.",
      "abc",
      "1,2,3",
      "-500",
      "1e6",
      "５００",
    ]) {
      assert.match(error(input, "COP"), /por ejemplo 1\.234\.567/, input);
    }
  });
});

describe("parseAmount in USD (cents)", () => {
  it("reads whole dollars and up to two decimals after a comma", () => {
    assert.equal(minor("1234", "USD"), 123_400);
    assert.equal(minor("1.234,56", "USD"), 123_456);
    assert.equal(minor("US$ 1.234,5", "USD"), 123_450);
    assert.equal(minor("0,01", "USD"), 1);
    assert.equal(minor("USD 10", "USD"), 1_000);
  });

  it("refuses more than two decimals instead of rounding", () => {
    assert.match(error("1,234", "USD"), /2 decimales/);
    assert.match(error("0,001", "USD"), /2 decimales/);
  });

  it("refuses a point used as the decimal separator", () => {
    assert.match(error("1234.56", "USD"), /coma para los decimales/);
    assert.match(error("1,234.56", "USD"), /coma para los decimales/);
  });
});

describe("parseAmount limits", () => {
  it("requires a value greater than zero", () => {
    assert.match(error("", "COP"), /Escribe el valor/);
    assert.match(error("   ", "USD"), /Escribe el valor/);
    assert.match(error("0", "COP"), /mayor que cero/);
    assert.match(error("0,00", "USD"), /mayor que cero/);
  });

  it("caps each amount at 999.999.999.999", () => {
    assert.equal(minor("999.999.999.999", "COP"), 999_999_999_999);
    assert.equal(minor("999.999.999.999,99", "USD"), 99_999_999_999_999);
    assert.match(error("1.000.000.000.000", "COP"), /999\.999\.999\.999/);
    assert.match(error("1.000.000.000.000", "USD"), /999\.999\.999\.999/);
    assert.ok(Number.isSafeInteger(MAX_AMOUNT_MINOR.USD));
  });
});

describe("formatAmount", () => {
  it("formats pesos without decimals and dollars with two", () => {
    assert.equal(formatAmount(1_234_567, "COP"), "$ 1.234.567");
    assert.equal(formatAmount(5, "COP"), "$ 5");
    assert.equal(formatAmount(123_456, "USD"), "US$ 1.234,56");
    assert.equal(formatAmount(1, "USD"), "US$ 0,01");
    assert.equal(formatAmount(100_000, "USD"), "US$ 1.000,00");
  });

  it("writes an amount back the way the form reads it", () => {
    assert.equal(formatAmountInput(1_234_567, "COP"), "1.234.567");
    assert.equal(formatAmountInput(123_450, "USD"), "1.234,50");
    for (const [value, currency] of [
      [987_654_321, "COP"],
      [1, "USD"],
      [99_999_999_999_999, "USD"],
    ] as const) {
      assert.equal(minor(formatAmountInput(value, currency), currency), value);
    }
  });
});

describe("sumAmounts", () => {
  it("adds minor units exactly", () => {
    assert.equal(sumAmounts([]), 0);
    assert.equal(sumAmounts([10, 20, 30]), 60);
    // 0.1 + 0.2 in cents stays exact.
    assert.equal(sumAmounts([10, 20]), 30);
  });

  it("refuses a total that would lose precision", () => {
    assert.throws(() => sumAmounts([Number.MAX_SAFE_INTEGER, 1]), RangeError);
  });
});
