/**
 * What one parser inspection reports — the wire shape shared by `/api/dev/lab/parse` and the page.
 *
 * 🔴 IT LIVES HERE RATHER THAN IN THE ROUTE BECAUSE NEXT VALIDATES ROUTE EXPORTS. A `route.ts` may
 * export handlers and a small set of config constants; an exported interface fails the build's route
 * type check. That is also the better shape: one file both halves import, so the page cannot drift
 * from what the server actually sends.
 *
 * 🔴 EVERY FIELD THAT CAN BE UNOBSERVED IS `| null`, AND NOTHING MAY COALESCE IT. `skippedFigures`
 * is the worked example: `0` means a lane counted and found none, `null` means the lane never
 * looked. This repo's most repeated defect in one field is a missing measurement reported as a
 * flattering one, and an inspector that did it would be reporting a lie about a parser it exists to
 * catch lying.
 */

import type { DocumentCounts, DocumentModel, ExtractionCoverage } from "@nemesis/shared";

import type { DocumentKind } from "@/lib/notebooks/parse-document";

/**
 * Which lane the owner asked for.
 *
 * 🔴 THESE ARE NOT THREE PARSERS. `production` and `native` are the SAME `parseDocument` call
 * differing in the one boolean production itself sets from the learner's daily vendor budget.
 * `vendor` is `parseWithVendor` — the function `parseDocument` calls when its router escalates.
 * There is no lane here a real upload cannot also take.
 */
export type LabLane = "production" | "native" | "vendor";

export const LAB_LANES: readonly LabLane[] = ["production", "native", "vendor"];

export interface LabFigureAsset {
  entry: string;
  contentKey: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** The pixels, when they fit under the transfer budget. `null` means withheld HERE — never
   *  "not extracted", which is a fact about the parse and is carried by the model's own figures. */
  dataUrl: string | null;
}

export interface LabParseReport {
  lane: LabLane;
  /** What actually ran, which is not always what was asked for. */
  laneRan: LabLane | "none";
  /** Stated whenever the answer is not the plain one — a vendor with no key, a format no vendor reads. */
  laneNote: string | null;
  fileName: string;
  fileType: string;
  fileBytes: number;
  kind: DocumentKind | null;
  elapsedMs: number;
  /** Whether each paid or metered primitive could have run at all in this environment. */
  configured: { mistral: boolean; llamaparse: boolean; vision: boolean };
  lookedAtFigures: boolean;
  outcome: { ok: true } | { ok: false; reason: string };
  document: {
    kind: DocumentKind;
    title: string | null;
    text: string;
    coverage: ExtractionCoverage;
    readBy: string | null;
    routeReason: string | null;
    skippedFigures: number | null;
    model: DocumentModel | null;
  } | null;
  counts: DocumentCounts | null;
  /** The text of each unit, in unit order. */
  unitText: string[] | null;
  figures: LabFigureAsset[];
  figuresWithheld: number;
}
