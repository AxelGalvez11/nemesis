// Run: npx tsx --test apps/web/lib/workspace/upload-ceiling-drift.test.ts
//
// 🔴 THE DOCUMENT-SIZE CEILING MAY EXIST IN EXACTLY ONE PLACE.
//
// This guards a class of bug, not a bug. The class: a file-size limit written
// out as a literal somewhere other than packages/shared/src/upload-limits.ts.
//
// WHY IT NEEDS A TEST AT ALL. A hard-coded limit never fails. It compiles, every
// existing test passes, and the only symptom is that files which should have
// been kept are quietly refused — which looks exactly like the file being too
// big. Six copies had accumulated by 2026-08-05 despite a shared constant
// existing for the express purpose of preventing that:
//
//   chat-attachments.ts   MAX_STORED_DOCUMENT_BYTES = 50 MiB
//     The dangerous one. A 118 MiB lecture would have uploaded to the bucket
//     successfully and then been dropped from chat storage by this line alone,
//     with nothing reporting it. It recreates silent document loss AFTER the
//     storage ceiling was fixed, which is why it is a correctness bug rather
//     than untidiness.
//   lms-import.ts         MAX_IMPORT_FILE_BYTES = 25 MiB, under a comment
//     claiming it "matches the extractor's own ceiling" — while the extractor's
//     was 50 and is now 200. A 30 MB lecture pulled from a course portal was
//     refused before transfer by a gate mirroring a number that had not been
//     true for months. A comment asserting two numbers agree is not a mechanism.
//   extract/file/route.ts, chat-attachments.ts, documents.ts (mobile)
//     three separate MAX_INLINE_* copies of the 4 MiB platform limit.
//   document-kind.test.ts asserted "limit is 50 MB" against a fixed 80 MB file,
//     so the raise broke it twice over: 80 MB stopped being oversize, and the
//     sentence no longer existed. A test hard-coding the limit it checks is the
//     same drift wearing a test's clothes.
//
// WHY STATIC. There is no behaviour to observe: each copy behaves perfectly, it
// just disagrees. The thing that must be prevented is the RESTATEMENT.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { MAX_INLINE_UPLOAD_BYTES, MAX_SOURCE_BYTES } from "@nemesis/shared";

const REPO = path.resolve(__dirname, "../../../..");
const ROOTS = ["apps/web", "apps/mobile", "packages/shared", "landing"];

/** The one file allowed to state these numbers. */
const HOME = path.join("packages", "shared", "src", "upload-limits.ts");

/** Source files, minus anything generated or vendored. */
function sources(dir: string, found: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, found);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * Every way a byte count can be written that would equal one of our ceilings.
 *
 * Covers `N * 1024 * 1024`, `N * 1_048_576`, and the raw byte count with or
 * without underscores — because the point is the VALUE, and a restatement is no
 * less a restatement for being spelled differently.
 */
function ceilingLiterals(bytes: number): RegExp[] {
  const mib = bytes / (1024 * 1024);
  const raw = String(bytes);
  const grouped = raw.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  return [
    new RegExp(`\\b${mib}\\s*\\*\\s*1024\\s*\\*\\s*1024\\b`),
    new RegExp(`\\b${mib}\\s*\\*\\s*1_?048_?576\\b`),
    new RegExp(`\\b${raw}\\b`),
    new RegExp(`\\b${grouped}\\b`),
  ];
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("no file restates the document-size ceiling — it has exactly one home", () => {
  const offenders: string[] = [];
  const patterns = [
    ...ceilingLiterals(MAX_SOURCE_BYTES).map((re) => ({ re, what: `MAX_SOURCE_BYTES (${MAX_SOURCE_BYTES})` })),
    ...ceilingLiterals(MAX_INLINE_UPLOAD_BYTES).map((re) => ({ re, what: `MAX_INLINE_UPLOAD_BYTES (${MAX_INLINE_UPLOAD_BYTES})` })),
  ];

  for (const root of ROOTS) {
    for (const file of sources(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      if (rel === HOME) continue;
      // The guard names the numbers it guards, so it would flag itself.
      if (rel.endsWith("upload-ceiling-drift.test.ts")) continue;
      const code = withoutComments(readFileSync(file, "utf8"));
      for (const { re, what } of patterns) {
        if (re.test(code)) offenders.push(`${rel} restates ${what}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `The ceiling must be imported from @nemesis/shared, never written out:\n  ${offenders.join("\n  ")}`,
  );
});

/**
 * 🔴 THE SPECIFIC FAILURE, pinned by behaviour rather than by grep.
 *
 * The literal is one way to recreate silent loss; a stale VALUE is the other. A
 * future edit could import the constant into a variable and then compare against
 * something smaller, and the grep above would be satisfied. So assert what the
 * gates actually decide about the one file that started this.
 */
test("the real 118 MiB lecture passes every size gate that could silently drop it", async () => {
  const LECTURE = 123_799_463; // measured: the immunology deck, 37 slides, 57 TIFFs

  const { MAX_IMPORT_FILE_BYTES } = await import("@nemesis/shared");
  const { DOCUMENT_MAX_BYTES } = await import("../../../mobile/src/lib/document-kind");

  assert.ok(LECTURE <= MAX_SOURCE_BYTES, "the storage ceiling would refuse it");
  assert.ok(LECTURE <= MAX_IMPORT_FILE_BYTES, "an LMS import would refuse it before transfer");
  assert.ok(LECTURE <= DOCUMENT_MAX_BYTES, "the phone would refuse it at the picker");

  // And the inline gate must still send it BY REFERENCE rather than as a body:
  // this is the one limit that must NOT rise with the others, because it is
  // Vercel's edge, not ours.
  assert.ok(LECTURE > MAX_INLINE_UPLOAD_BYTES, "a 118 MiB multipart body would die at the edge");
  assert.equal(MAX_INLINE_UPLOAD_BYTES, 4 * 1024 * 1024, "the platform limit moved with the product one");
});
