// The client catalogue is paginated; a form must not silently omit later pages.
export async function collectClientPages<T>(
  load: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await load(page);
    items.push(...result.items);
    if (!result.hasMore) return items;
  }
}
