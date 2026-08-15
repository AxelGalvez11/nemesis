/**
 * A source file's CODE, with its comments removed.
 *
 * 🔴 IT EXISTS BECAUSE A SCANNING GUARD IN THIS DIRECTORY WENT RED ON ITS OWN FIX. `reprocess.test.ts`
 * asserts that `mechanismsUnder ===` no longer appears anywhere — and the comment explaining that it
 * used to appear says those very words. In a codebase this heavily commented that is not a corner
 * case, it is the normal case, and it cuts both ways: a scanner that reads prose can be SATISFIED by
 * a comment promising the code exists, and BROKEN by one quoting the code it removed. The first is
 * the dangerous half — a guard that passes because someone wrote a sentence.
 *
 * 🔴 SHARED RATHER THAN COPIED INTO EACH TEST, because two copies of a scanner is two scanners that
 * drift, and the one that drifts is the one nobody re-calibrates.
 *
 * Approximate by design — it is a test aid, not a parser. `[^:]` keeps `https://` out of the
 * line-comment rule; a `//` inside a string literal is still cut, which can only ever remove text a
 * guard was looking for (a false RED, which gets investigated) and never invent text it was not (a
 * false GREEN, which does not).
 *
 * PURE. Reading the file is the caller's job.
 */
export function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}
