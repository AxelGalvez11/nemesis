/**
 * Checking the cheap route's homework, on a bounded sample, without the learner paying for it.
 *
 * 🔴🔴 THE OWNER'S WARNING, WHICH IS THE WHOLE REASON THIS EXISTS: *"A cheap parser saying 'good
 * enough' can be dangerous if it silently drops educational content."* `preflightPdf` and
 * `preflightOffice` decide from the file's own evidence that a vendor would add nothing. Those
 * decisions are calibrated against a generated corpus, and they are still decisions made WITHOUT
 * asking the vendor. Their failure mode is the quietest one this codebase has: the document parses,
 * coverage says complete, the learner reads it, and one table is missing.
 *
 * So a sampled fraction of the documents the cheap route passed are ALSO sent to the vendor,
 * afterwards, for evaluation only, and the comparison is written down.
 *
 * 🔴 EVERY BOUND THE OWNER ASKED FOR IS A MECHANISM RATHER THAN A PROMISE:
 *
 *   bounded          `claim_parse_shadow_run` takes one of the day's slots IN SQL, so two workers
 *                    cannot both spend the last one. Below the cap nothing runs.
 *   observable       every run writes a row, including the ones that find nothing — a false-pass
 *                    RATE is meaningless without its denominator.
 *   never the learner's result   the parse is recorded and linked before this is called. The
 *                    learner already has their document; this cannot make them wait for it and
 *                    cannot fail it.
 *   easy to turn off `PARSE_SHADOW_RATE=0` stops it completely, with no deploy.
 *   not permanent    nothing in the routing path reads these rows. They exist to be counted by a
 *                    person deciding whether to keep paying for them.
 *
 * 🔴 AND THE COMPARISON IS NOT A CHARACTER COUNT. The owner is explicit: *"A 99% text match that
 * loses the one contraindication table can be worse than a 90% match that preserves the important
 * structure."* Each recoverable KIND is counted on both sides. `minor` — different phrasing, a
 * paragraph split in two, one more list item — is not a false pass and must not be counted as one,
 * or the rate measures how differently two parsers write rather than whether anything was lost.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { documentToText, type DocumentModel } from "@nemesis/shared";

import { recordAiSpend } from "@/lib/cost/ai-spend";

import { parseWithVendor, type DocumentKind, type ParsedDocument } from "./parse-document";

/**
 * The share of cheap-route parses that are also checked.
 *
 * 🔴 SMALL, AND THE DEFAULT IS A CALIBRATION SETTING RATHER THAN A PERMANENT ONE. At 5% a library
 * of a hundred documents pays for five extra vendor reads once. That is enough to put a number on
 * the false-pass rate and far too little to matter on a bill; the daily cap below is what bounds
 * the worst case rather than this.
 */
export const DEFAULT_SHADOW_RATE = 0.05;

/** The most shadow runs anywhere in the system in one UTC day. */
export const DEFAULT_SHADOW_DAILY_CAP = 20;

/**
 * The most bytes worth checking.
 *
 * A 120 MB deck is the most expensive possible shadow run and the least informative: the reason a
 * huge file is huge is usually its media, which is the thing the native lane is best at.
 */
export const SHADOW_MAX_BYTES = 12 * 1024 * 1024;

export function shadowRate(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseFloat((env.PARSE_SHADOW_RATE ?? "").trim());
  if (!Number.isFinite(raw)) return DEFAULT_SHADOW_RATE;
  return Math.min(1, Math.max(0, raw));
}

export function shadowDailyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt((env.PARSE_SHADOW_DAILY_CAP ?? "").trim(), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SHADOW_DAILY_CAP;
}

/**
 * Should this parse be sampled? PURE.
 *
 * 🔴 SAMPLED ON THE CONTENT HASH, NOT ON A RANDOM NUMBER, AND THE DIFFERENCE IS REPRODUCIBILITY.
 * A random draw makes "why was this file checked and that one not" unanswerable, and makes a
 * reparse of the same file a fresh coin toss — so a document could be shadow-checked five times
 * while its neighbour is never checked at all. Hashing means the sample is a stable, uniform
 * subset of the corpus: the same file is always in it or always out of it.
 */
export function shouldShadow(contentHash: string, rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  // The last 8 hex digits as a fraction of the space. sha256 is uniform, so any fixed window is.
  const window = contentHash.slice(-8);
  const value = Number.parseInt(window, 16);
  if (!Number.isFinite(value)) return false;
  return value / 0xffffffff < rate;
}

/** What one parse recovered, counted by the kinds a learner would miss. PURE. */
export interface TeachingRecovery {
  readonly chars: number;
  readonly units: number;
  readonly blocks: number;
  readonly tables: number;
  readonly tableCells: number;
  readonly figures: number;
  readonly headings: number;
  readonly listItems: number;
  readonly equations: number;
}

export function recoveryOf(model: DocumentModel | undefined, text: string): TeachingRecovery {
  const blocks = model?.blocks ?? [];
  const of = (kind: string) => blocks.filter((block) => block.kind === kind).length;
  return {
    blocks: blocks.length,
    chars: text.trim().length,
    equations: of("equation"),
    figures: of("figure"),
    headings: of("heading"),
    listItems: of("listItem"),
    tableCells: blocks.reduce(
      (n, block) => n + (block.table?.rows.reduce((m, row) => m + row.length, 0) ?? 0),
      0,
    ),
    tables: of("table"),
    units: model?.units.length ?? 0,
  };
}

export type ShadowOutcome = "safe" | "minor" | "serious" | "vendor-unavailable";

/**
 * A shortfall this large in TEXT is a wholesale loss rather than a difference of style.
 *
 * 🔴 A RATIO, NOT A DIFFERENCE, AND SET WHERE THE MEASURED FAILURE SAT. The case Mistral was bought
 * for produced 16,823 words against the local reader's 9,098 — 1.85x. The speaker-notes case was a
 * deck arriving with a third of its concepts, 399 content words against 1,141 — 2.9x. Two thirds
 * of the text missing is not a parser writing differently.
 */
export const SERIOUS_TEXT_RATIO = 1.8;

/**
 * Judge one comparison. PURE.
 *
 * 🔴 `serious` MEANS A KIND THE CHEAP READ HAS NONE OF, OR MOST OF THE TEXT MISSING. Not "fewer
 * than"; NONE. A native read with 9 tables against a vendor's 11 is two parsers disagreeing about
 * where a grid ends, which the quality gate has always accepted in the other direction. A native
 * read with 0 tables against a vendor's 11 is a document whose grids did not arrive.
 */
export function judgeShadow(
  native: TeachingRecovery,
  vendor: TeachingRecovery,
): { outcome: Exclude<ShadowOutcome, "vendor-unavailable">; detail: string } {
  const missingKinds: string[] = [];
  const kinds: readonly (readonly [string, number, number])[] = [
    ["table", native.tables, vendor.tables],
    ["figure", native.figures, vendor.figures],
    ["equation", native.equations, vendor.equations],
  ];
  for (const [name, ours, theirs] of kinds) {
    if (ours === 0 && theirs > 0) missingKinds.push(`${theirs} ${name}(s)`);
  }

  if (native.chars > 0 && vendor.chars / Math.max(native.chars, 1) >= SERIOUS_TEXT_RATIO) {
    missingKinds.push(`${vendor.chars} characters against our ${native.chars}`);
  }
  // 🔴 AND A CHEAP READ THAT PRODUCED NOTHING AT ALL, against a vendor that produced something, is
  // the most serious case there is — and the ratio above cannot see it, because it divides by a
  // number the guard above already refused to let be zero.
  if (native.chars === 0 && vendor.chars > 0) {
    missingKinds.push(`${vendor.chars} characters against our none`);
  }

  if (missingKinds.length > 0) {
    return {
      detail: `the vendor recovered ${missingKinds.join(", ")} that the cheap route did not`,
      outcome: "serious",
    };
  }

  const differences: string[] = [];
  if (vendor.tables > native.tables) differences.push(`tables ${native.tables}->${vendor.tables}`);
  if (vendor.figures > native.figures) differences.push(`figures ${native.figures}->${vendor.figures}`);
  if (vendor.listItems > native.listItems) differences.push(`list items ${native.listItems}->${vendor.listItems}`);
  if (vendor.chars > native.chars * 1.1) differences.push(`chars ${native.chars}->${vendor.chars}`);

  return differences.length > 0
    ? { detail: `differences that are not losses: ${differences.join(", ")}`, outcome: "minor" }
    : { detail: "the cheap route recovered everything the vendor did", outcome: "safe" };
}

export interface ShadowInput {
  readonly admin: SupabaseClient;
  readonly userId: string;
  readonly sourceId: string;
  readonly contentHash: string;
  readonly kind: DocumentKind;
  readonly routeReason: string;
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: string;
  /** The parse the learner actually has. Never modified here. */
  readonly shipped: ParsedDocument;
}

/**
 * Run one shadow evaluation, if this document is in the sample and the day has a slot left.
 *
 * Never throws, and never touches the learner's parse. Returns what happened, for the log.
 */
export async function runShadowEvaluation(
  input: ShadowInput,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ran: false; why: string } | { ran: true; outcome: ShadowOutcome; detail: string }> {
  const rate = shadowRate(env);
  if (!shouldShadow(input.contentHash, rate)) return { ran: false, why: "not in the sample" };
  if (input.bytes.byteLength > SHADOW_MAX_BYTES) return { ran: false, why: "past the shadow size cap" };

  // 🔴 THE SLOT IS TAKEN BEFORE THE VENDOR IS CALLED. Counting afterwards records nothing when the
  // platform kills the process, which is exactly the expensive case — the same reserve-then-settle
  // argument `reserve_vision_units` makes.
  let claimed = false;
  try {
    const { data, error } = await input.admin.rpc("claim_parse_shadow_run", {
      p_daily_cap: shadowDailyCap(env),
    });
    if (error) return { ran: false, why: `shadow bound unavailable: ${error.message.slice(0, 80)}` };
    claimed = data === true;
  } catch {
    return { ran: false, why: "shadow bound unavailable" };
  }
  if (!claimed) return { ran: false, why: "today's shadow budget is spent" };

  const started = Date.now();
  let vendorOutcome: Awaited<ReturnType<typeof parseWithVendor>> = null;
  try {
    // 🔴 `lookAtFigures` IS OFF. A shadow run is a comparison of what each parser RECOVERED, and
    // vision descriptions are not recovery — they are a separate paid pass over figures both sides
    // already found. Paying for them here would double the cost of the check and change none of
    // its answers.
    vendorOutcome = await parseWithVendor(input.bytes, input.fileName, input.mimeType, input.kind, {});
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "parse_shadow_threw",
      detail: cause instanceof Error ? cause.message.slice(0, 200) : String(cause).slice(0, 200),
    }));
  }
  const vendorMs = Date.now() - started;

  const nativeRecovery = recoveryOf(input.shipped.model, input.shipped.text);
  const vendorDocument =
    vendorOutcome && (vendorOutcome.ok || vendorOutcome.reason === "no-text") ? vendorOutcome.document : null;

  const verdict = vendorDocument
    ? judgeShadow(
        nativeRecovery,
        recoveryOf(vendorDocument.model, vendorDocument.model ? documentToText(vendorDocument.model) : vendorDocument.text),
      )
    : {
        detail: "the vendor did not answer, so this sample says nothing about the cheap route",
        outcome: "vendor-unavailable" as const,
      };

  try {
    await input.admin.from("parse_shadow_evals").insert({
      content_hash: input.contentHash,
      detail: verdict.detail.slice(0, 500),
      doc_kind: input.kind,
      native: nativeRecovery as unknown as Record<string, unknown>,
      outcome: verdict.outcome,
      route_reason: input.routeReason,
      source_id: input.sourceId,
      user_id: input.userId,
      vendor: (vendorDocument
        ? recoveryOf(vendorDocument.model, vendorDocument.text)
        : {}) as unknown as Record<string, unknown>,
      vendor_ms: vendorMs,
    });
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "parse_shadow_record_failed",
      detail: cause instanceof Error ? cause.message.slice(0, 160) : "unknown",
    }));
  }

  // 🔴 THE CHECK PAYS FOR ITSELF OUT OF THE SAME LEDGER EVERYTHING ELSE DOES. A shadow evaluation is
  // duplicate spend by construction, and the one thing that would make it indefensible is for it to
  // be invisible in the cost report while the routing decisions it audits are visible. `operation`
  // says what it was for, so it can be subtracted from — or argued about alongside — the saving.
  if (vendorDocument) {
    await recordAiSpend(input.admin, {
      durationMs: vendorMs,
      provider: input.kind === "pdf" ? "mistral_ocr" : "llamaparse",
      reason: `shadow:${input.routeReason}`,
      scope: { operation: "shadow-eval", sourceId: input.sourceId },
      units: vendorDocument.coverage.units || 0,
      userId: input.userId,
    });
  }

  console.info(JSON.stringify({
    event: "parse_shadow_evaluated",
    detail: verdict.detail,
    kind: input.kind,
    ms: vendorMs,
    outcome: verdict.outcome,
    routeReason: input.routeReason,
    sourceId: input.sourceId,
  }));

  return { detail: verdict.detail, outcome: verdict.outcome, ran: true };
}
