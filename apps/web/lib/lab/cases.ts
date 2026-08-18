/**
 * Saved failures — Nemesis Lab §14.
 *
 * 🔴🔴 A CASE MUST REPRODUCE WITHOUT THE SESSION THAT FOUND IT. That is the whole requirement, and
 * it is what decides the storage: a parser case keeps THE FILE, not a source id, because a row can
 * be deleted and a re-upload is a different parse; a tutor case keeps the controller's whole frozen
 * context and the judge's whole input, not a canvas id, because a canvas moves the moment anyone
 * uses it. Anything that points AT live state instead of holding a copy stops reproducing quietly.
 *
 * 🔴 ON DISK, IN THE REPO, ON PURPOSE. The owner asked for this to become "Nemesis's internal
 * evaluation corpus" over time. A corpus in a developer's browser storage is not one; a corpus in
 * the database belongs to whichever environment holds that database. Files can be committed,
 * reviewed, and run in CI beside the acceptance scripts that already live in `apps/web/scripts`.
 *
 * 🔴 AND IT IS DELIBERATELY NOT A TEST-CASE MANAGEMENT SYSTEM. No suites, no tags, no priorities,
 * no runners of runners. A case is: what file or what frozen turn, what the owner said was wrong,
 * and what was observed at the time. Everything else is scope the owner explicitly ruled out.
 *
 * SERVER ONLY. Filesystem access.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where cases live. Beside the app, so they are committable and visible in review. */
// 🔴 `process.cwd()` FOR THE SAME REASON AS `lib/lab/learner.ts`: Turbopack resolves
// `new URL(…, import.meta.url)` as a module and fails the build. `apps/web` is the dev server's
// working directory, and `apps/web/scripts/lab-replay.ts` runs from there too.
export const CASE_ROOT = join(process.cwd(), "lab-cases") + "/";

export type LabCaseKind = "parser" | "tutor";

export interface LabCase {
  id: string;
  kind: LabCaseKind;
  /** The owner's own words about what is wrong. The only description that matters. */
  note: string;
  savedAt: string;
  /** Parser cases only: the file, stored beside the case so a rerun reads the same bytes. */
  file?: { name: string; type: string; bytes: number; path: string };
  /** Parser cases only: the unit the owner was looking at. */
  unit?: number;
  /**
   * What was observed when the case was saved.
   *
   * 🔴 IT IS NOT AN EXPECTATION, AND THE DIFFERENCE MATTERS. The owner saves a case because the
   * behaviour is WRONG; recording it as the expected result would turn a defect into a guard that
   * fails the day someone fixes it. A rerun therefore reports WHAT CHANGED against this baseline
   * and never passes or fails on it. See `lab-replay.ts`.
   */
  observed: Record<string, unknown>;
}

/**
 * Is this id one this module will touch a path with?
 *
 * 🔴 EVERY READER CHECKS, NOT JUST THE DELETE. The id arrives from a URL segment on `[id]` and
 * `[id]/rerun`, and a localhost-only route is still a route: `..` in a path segment turns "read one
 * case" into "read any file this process can reach". Holding the delete to one standard and the two
 * reads to another is the shape of gap that gets found from the outside.
 */
function safeId(id: string): boolean {
  return /^[\w.\-]+$/.test(id) && !id.includes("..");
}

function caseDir(id: string): string {
  return `${CASE_ROOT}${id}/`;
}

/** A readable, sortable, collision-free id. Time first so `ls` is chronological. */
export function newCaseId(kind: LabCaseKind, stamp: Date, note: string): string {
  const when = stamp.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const slug = note
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${when}-${kind}${slug ? `-${slug}` : ""}`;
}

export function saveCase(entry: LabCase, file?: { name: string; bytes: Uint8Array }): LabCase {
  const dir = caseDir(entry.id);
  mkdirSync(dir, { recursive: true });
  const stored = { ...entry };
  if (file) {
    const path = `${dir}source-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120)}`;
    writeFileSync(path, file.bytes);
    stored.file = { bytes: file.bytes.byteLength, name: file.name, path, type: stored.file?.type ?? "" };
  }
  writeFileSync(`${dir}case.json`, `${JSON.stringify(stored, null, 2)}\n`);
  return stored;
}

export function listCases(): LabCase[] {
  if (!existsSync(CASE_ROOT)) return [];
  const cases: LabCase[] = [];
  for (const entry of readdirSync(CASE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const loaded = readCase(entry.name);
    if (loaded) cases.push(loaded);
  }
  return cases.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function readCase(id: string): LabCase | null {
  if (!safeId(id)) return null;
  try {
    return JSON.parse(readFileSync(`${caseDir(id)}case.json`, "utf8")) as LabCase;
  } catch {
    return null;
  }
}

export function deleteCase(id: string): boolean {
  if (!safeId(id)) return false;
  const dir = caseDir(id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { force: true, recursive: true });
  return true;
}

/** Read the file a parser case saved, for a rerun. */
export function readCaseFile(entry: LabCase): Uint8Array | null {
  if (!entry.file) return null;
  // 🔴 THE STORED PATH MUST STILL BE INSIDE THE CASE ROOT. `case.json` is a file on disk, so its
  // `path` is data rather than something this module computed just now, and a hand-edited or
  // hand-copied case must not be able to make a rerun read anything it likes.
  if (!entry.file.path.startsWith(CASE_ROOT)) return null;
  try {
    return new Uint8Array(readFileSync(entry.file.path));
  } catch {
    return null;
  }
}
