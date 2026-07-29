// Reading a whole table, honestly.
//
// PostgREST caps ANY single response at 1,000 rows and reports no error when it
// does — a truncated answer is shaped exactly like a complete one. That is what
// made 5,578 of a student's 6,550 flashcards invisible while the rows sat in the
// database the whole time: new cards sort last by due_at, so every card made
// after the account crossed 1,000 fell off the end of the only page anyone
// fetched. The same silent cut was waiting on the Library, the Calendar and the
// chat history; they were simply under the cap so far.
//
// So: page until a short page comes back.
//
// THE CALLER MUST SUPPLY A SORT ENDING IN A UNIQUE COLUMN. Paging an ambiguous
// sort is worse than truncating, because Postgres may order ties differently on
// each request — rows then get skipped and duplicated across page boundaries
// instead of merely stopping at a visible edge. A whole deck written in one
// insert shares ONE created_at to the microsecond, so timestamps are nowhere
// near unique; end every order chain with `id`.

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
