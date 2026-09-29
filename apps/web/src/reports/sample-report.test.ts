import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportTotals, sampleReport } from "./sample-report.ts";

describe("sample report", () => {
  it("is flagged as sample data", () => {
    assert.equal(sampleReport.isSample, true);
  });

  it("uses only clearly fictitious names", () => {
    assert.match(sampleReport.client.name, /ejemplo/i);
    assert.match(sampleReport.professional, /ejemplo/i);
    assert.ok(sampleReport.lines.length >= 3);
  });

  it("computes per-line and total minutes exactly", () => {
    const totals = reportTotals(sampleReport);
    const manual = sampleReport.lines.reduce((acc, l) => acc + l.minutes, 0);
    assert.equal(totals.minutes, manual);
    assert.equal(totals.lines, sampleReport.lines.length);
    assert.ok(totals.minutes > 0);
  });

  it("orders lines chronologically and stays inside the stated period", () => {
    const dates = sampleReport.lines.map((l) => l.date);
    assert.deepEqual([...dates].sort(), dates);
    for (const d of dates) {
      assert.ok(d >= sampleReport.period.from && d <= sampleReport.period.to);
    }
  });

  it("carries no monetary amounts", () => {
    assert.equal(
      JSON.stringify(sampleReport).match(/\$|€|amount|price|tarifa/i),
      null,
    );
  });
});
