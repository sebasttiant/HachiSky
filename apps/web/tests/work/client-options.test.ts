import assert from "node:assert/strict";
import { it } from "node:test";
import { collectClientPages } from "../../src/work/client-options.ts";

it("includes clients after page 25 and preserves page order", async () => {
  const pages: number[] = [];
  const items = await collectClientPages(async (page) => {
    pages.push(page);
    return {
      items: Array.from({ length: page === 1 ? 25 : 1 }, (_, i) => ({
        id: String((page - 1) * 25 + i + 1),
      })),
      hasMore: page === 1,
    };
  });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(items.length, 26);
  assert.equal(items[25].id, "26");
});

it("preserves a single page and stops for an empty result", async () => {
  for (const expected of [[], [{ id: "1" }]]) {
    let calls = 0;
    const result = await collectClientPages(async () => {
      calls++;
      return { items: expected, hasMore: false };
    });
    assert.deepEqual(result, expected);
    assert.equal(calls, 1);
  }
});
