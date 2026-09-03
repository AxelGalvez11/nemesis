// What the strip says when a batch of dropped files has finished attaching.
//
// 🔴🔴 THE BATCH USED TO ABORT ON THE FIRST BAD FILE. One `try` wrapped the whole attach loop, so
// when file seven of fifty could not be read, files eight to fifty were never attached and the
// only account of it was that one file's error string. The learner had dropped fifty lectures and
// silently had six. Owner, 2026-09-03: *"there should be no problem with any of them."* Now every
// file gets its own try, and this sentence is the report at the end: how many are in, and which
// ones are not, by name.
//
// 🔴 NAMED, NOT COUNTED ALONE. "3 couldn't be read" sends the learner hunting through fifty cards;
// the names are the thing they can act on. Capped so a pathological batch cannot print a page.

const MAX_NAMED = 6;

/** The report for one batch, or null when every file attached and there is nothing to say. */
export function attachOutcomeMessage(attached: number, failed: readonly string[]): string | null {
  if (failed.length === 0) return null;
  const named = failed.slice(0, MAX_NAMED).join(", ");
  const rest = failed.length > MAX_NAMED ? ` and ${failed.length - MAX_NAMED} more` : "";
  const head =
    attached === 0
      ? failed.length === 1
        ? "That file couldn't be read"
        : "None of those files could be read"
      : `${attached} ${attached === 1 ? "document" : "documents"} attached. ${failed.length} ${failed.length === 1 ? "couldn't" : "couldn't"} be read`;
  return `${head}: ${named}${rest}.`;
}
