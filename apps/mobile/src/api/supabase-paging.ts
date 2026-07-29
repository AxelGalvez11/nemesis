/**
 * Read EVERY row of a query, a page at a time.
 *
 * PostgREST silently caps a response at 1,000 rows. Not an error — a short
 * answer that looks exactly like the whole answer, so nothing anywhere reports
 * a problem.
 *
 * What that did on the Study screen: the phone loaded cards ordered by `due_at`
 * ascending. With 6,550 cards the first 1,000 are the oldest due dates, i.e.
 * the imported Anki decks. A deck generated TODAY gets today's timestamp, sorts
 * LAST, and falls off the end of the page — so a student asks chat for a deck,
 * the deck row appears, and it contains nothing. The 28 cards were in the
 * database the entire time. That is every new card from every source: chat,
 * import, and the Add card button.
 *
 * The Library read had the same shape and was simply still under the cap.
 *
 * The caller MUST end its sort on a unique column. Paging an ambiguous sort
 * skips and duplicates rows, because Postgres may order ties differently per
 * request — and a whole deck written in one insert shares one `due_at` to the
 * microsecond, so `due_at` is about as ambiguous as a sort key gets.
 *
 * Mirrors apps/web/lib/workspace/supabase-paging.ts; the two apps must read a
 * collection the same way or the same account shows different contents.
 */
export const PAGE_SIZE = 1_000;

export async function fetchAllRows<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    // A short page means there is nothing after it. An exactly-full last page
    // costs one extra empty request, which is the cheap side of the trade.
    if (batch.length < PAGE_SIZE) return rows;
  }
}
