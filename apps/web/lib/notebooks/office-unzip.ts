// Opening an Office archive SAFELY, and nothing else.
//
// 🔴🔴 SPLIT OUT OF `office.ts` SO A BROWSER CAN IMPORT IT. `office.ts` pulls in `node:crypto` at
// module scope and half the extraction pipeline behind it, so anything importing it is a server
// module. The spreadsheet READER needs the same bounded unzip in the browser — and a second copy of
// a limit that exists to stop a zip bomb is exactly the kind of duplicate that drifts apart and
// leaves one lane unprotected. `office.ts` re-exports these, so every existing caller and its tests
// are untouched.

import { unzipSync } from "fflate";

/**
 * Most a .docx/.pptx may weigh once unpacked.
 *
 * BOUNDED INPUT, UNBOUNDED EXPANSION was the hole: the route refuses an upload
 * over 25 MB, and then handed the bytes to `unzipSync`, which inflates the whole
 * archive into memory with no ceiling of its own. Deflate reaches roughly 1000:1
 * on repetitive data, so a hand-made 25 MB zip is comfortably tens of gigabytes
 * once open — the serverless instance dies before any text cap is consulted,
 * because TEXT_CAP is applied to the OUTPUT of extraction, long after.
 *
 * 🔴 THIS IS A MEMORY BUDGET, NOT A MULTIPLE OF THE UPLOAD CEILING.
 *
 * The old justification was "the route already refuses more than 25 MB of them
 * compressed" — a sentence that stopped being true when the extract route moved
 * to 50 MiB, and would be off eight-fold at 200 MiB. A comment asserting a
 * relationship between two numbers is not a mechanism.
 *
 * The obvious repair is to derive it, `N * MAX_SOURCE_BYTES`. That is wrong, and
 * wrong in the dangerous direction: it makes the safety limit MOVE whenever the
 * product limit moves, in whichever direction that happens to be. At the 50 MiB
 * ceiling a doubling would have SHRUNK this to 100 MiB and started refusing
 * lecture decks that work today.
 *
 * What actually constrains it is the machine. The function instance is 2 GB and
 * Fluid Compute shares one instance between concurrent requests, so this has to
 * fit ALONGSIDE the source buffer, several times over, without an
 * out-of-memory that would also kill whatever unrelated requests were in flight.
 * That number does not change when an upload limit changes.
 *
 * The one relationship that must hold is the floor, and it is asserted in the
 * test rather than described here: a zip's entries can be STORED rather than
 * deflated (the owner's real deck stores all 68 of its media parts at method 0),
 * so a source at the ceiling can legitimately inflate to its own size. A budget
 * below MAX_SOURCE_BYTES would refuse a file the product had just accepted.
 */
export const UNZIP_MAX_TOTAL_BYTES = 400 * 1024 * 1024;

/** Most entries a legitimate Office file contains. A zip can also attack by
 *  COUNT rather than size — a million empty files costs nothing to compress and
 *  a great deal to allocate. A 500-slide deck with notes, diagrams, charts and
 *  media runs to a few thousand parts. */
export const UNZIP_MAX_ENTRIES = 20_000;

/**
 * `unzipSync` with a ceiling on what comes OUT.
 *
 * fflate has no per-archive budget, so the sizes are summed as the entries are
 * walked and the whole extraction is abandoned the moment the running total
 * crosses the limit — the point is to stop before the memory is committed, not
 * to report on it afterwards.
 *
 * Throws a student-readable message: the route turns a throw into a friendly
 * error, and "this file is too big once unpacked" is true and actionable, while
 * a crashed instance tells them nothing at all.
 */
/**
 * A refusal WE decided on, as opposed to a container that would not parse.
 *
 * 🔴 THE DISTINCTION MATTERS AT THE CATCH BELOW. Our refusals already say
 * something true and readable about the file; fflate's do not. Without a way to
 * tell them apart, wrapping the parse failure would also swallow "that file has
 * too many parts to open safely" and replace it with something vaguer.
 */
class ArchiveRefusal extends Error {}

export function unzipBounded(bytes: Uint8Array): Record<string, Uint8Array> {
  let total = 0;
  let entries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipEntries();
  } catch (cause) {
    if (cause instanceof ArchiveRefusal) throw cause;
    // 🔴 `invalid zip data` IS NOT A SENTENCE FOR A STUDENT. fflate's message
    // reached the upload response verbatim whenever a file was truncated, was
    // not really an Office file, or had been renamed from something else — and
    // it reads as an application fault rather than as a fact about their file.
    throw new Error("That file couldn't be opened. It may be damaged, or not really a Word, PowerPoint or Excel file.");
  }
  return files;

  function unzipEntries(): Record<string, Uint8Array> {
  return unzipSync(bytes, {
    filter(file) {
      entries += 1;
      if (entries > UNZIP_MAX_ENTRIES) {
        throw new ArchiveRefusal("That file has too many parts to open safely.");
      }
      // `originalSize` is the header's claim, which a crafted zip can lie about.
      // It is still worth checking: an honest bomb is refused before a single
      // byte is inflated. The post-inflation sum below is what catches a liar.
      total += file.originalSize ?? 0;
      if (total > UNZIP_MAX_TOTAL_BYTES) {
        throw new ArchiveRefusal("That file is too large once unpacked. Try exporting it again, or split it up.");
      }
      return true;
    },
  });
  }
}

// 🔴 THE POST-INFLATION SUM THAT USED TO LIVE IN `unzipBounded` HAS BEEN
// DELETED, AND NOTHING SHOULD PUT IT BACK.
/*
  //
  // It walked `Object.keys(files)` adding up `byteLength` and threw if the total
  // crossed the same ceiling — after `unzipSync` had already returned, which is
  // to say after every byte it was measuring had already been allocated. It
  // could only ever report a bomb that had already gone off, while reading like
  // a guard: the comment above it claimed it was "what catches a liar".
  //
  // What actually protects this call is the filter above, which refuses before
  // fflate commits memory. Its input is the entry header's own `originalSize`,
  // which a crafted archive can understate — so state the limit honestly: an
  // HONEST oversized file is refused for free, and a LIAR is bounded only by the
  // source ceiling, because a zip cannot inflate what it does not contain and
  // the object was capped at MAX_SOURCE_BYTES before it ever got here. Closing
  // that gap properly needs streaming inflation, not another sum.
*/
