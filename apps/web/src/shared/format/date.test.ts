import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_LOCALE,
  APP_TIME_ZONE,
  formatDate,
  formatDateLong,
} from "./date.ts";

describe("es-CO date formatting", () => {
  it("declares the Colombian locale and time zone", () => {
    assert.equal(APP_LOCALE, "es-CO");
    assert.equal(APP_TIME_ZONE, "America/Bogota");
  });

  it("formats ISO dates as dd/mm/yyyy", () => {
    assert.equal(formatDate("2026-03-02"), "02/03/2026");
    assert.equal(formatDate("2026-12-31"), "31/12/2026");
  });

  it("formats long dates in Spanish", () => {
    assert.equal(formatDateLong("2026-03-02"), "2 de marzo de 2026");
  });

  it("does not shift the calendar day across time zones", () => {
    // Midnight UTC would be the previous day in Bogota if parsed naively.
    assert.equal(formatDate("2026-01-01"), "01/01/2026");
  });

  it("rejects malformed dates", () => {
    assert.throws(() => formatDate("02/03/2026"), RangeError);
    assert.throws(() => formatDate("2026-13-40"), RangeError);
  });
});
