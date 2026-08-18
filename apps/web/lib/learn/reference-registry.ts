// The curated half of §42's rung three — a small registry, entered by hand.
//
// 🔴 IT IS EMPTY, AND THAT IS THE ONLY HONEST STATE IT COULD SHIP IN. A row here is a claim that a
// specific file carries a specific licence and is owed a specific credit. Writing one from memory
// is the same act §42 forbids everywhere else in the ladder: a plausible-looking assertion nobody
// checked, indistinguishable in the output from a verified one. The environment this was authored
// in has no outbound access to any image repository, so no file could be opened and no licence
// could be read — and a table of five confident-looking rows would have been worse than none,
// because the next reader would have trusted it.
//
// 🔴 IT IS NOT A CORPUS AND MUST NOT BECOME ONE: *"Do NOT bulk-ingest the internet."* Every row is
// meant to be a file somebody opened, read the licence of, and wrote down. That is slow, which is
// the point — the alternative is ten thousand rows whose licences were correct on the day a crawler
// ran and are unverifiable afterwards.
//
// 🔴 WITH IT EMPTY, THE LIVE PROVIDER IS THE ONLY SOURCE OF CANDIDATES, and a concept it cannot
// match returns `no-candidates` — the honest answer "no trustworthy picture of this exists in
// Nemesis yet" rather than a generated impression of one. The Visual Lab shows that outcome
// explicitly rather than hiding an empty result.
//
// ── HOW TO ADD A ROW ────────────────────────────────────────────────────────────────────────────
// 1. Open the file's OWN page in its repository — not the search result, not the article using it.
// 2. Read the licence recorded for THAT FILE. A repository's general reuse policy is not a licence.
// 3. Copy the credit line the licence asks for into `attribution`, verbatim.
// 4. Put an SPDX-style identifier in `licence`. If it is not one `REUSABLE_LICENCES` lists, the row
//    does not belong here — `chooseAsset` would refuse it anyway, and that is the safety net rather
//    than the process.
// 5. `assetPath` should be an object in Nemesis storage once the fetch-once-and-store pass exists.
//    Until then an original URL is acceptable and is a known weakness: a hotlinked file can move or
//    disappear, and the learner is the one who finds out.

import type { CuratedEntry } from "./reference-images";

/** Hand-verified rows. See the header for why this is empty and what adding one requires. */
export const REFERENCE_REGISTRY: readonly CuratedEntry[] = [];
