/**
 * Looking at the figures a PDF actually contains.
 *
 * The routing decision is in `figure-routing.ts` and is pure. The pixels come
 * from `figure-image.ts` and are pure. This file is the small impure seam that
 * joins them to a provider, so everything interesting stays testable without a
 * network.
 *
 * 🔴 EVERY FIGURE THAT WAS ROUTED GETS AN ANSWER, INCLUDING "NOTHING". A figure
 * sent to vision that comes back empty is recorded as `examined-empty`; one that
 * had no pixels to send is `unsupported`; one skipped because vision is not
 * configured is `vision-unavailable`. What must never happen is a routed figure
 * silently keeping its original no-reason state, because that state means
 * "nobody looked" and would make a vision pass that ran indistinguishable from
 * one that did not.
 */

import type { DocumentModel } from "@nemesis/shared";

import type { FigureLabel } from "@/lib/learn/figure-labels";

import { applyFigureDescriptions, planFigureVision, type RoutingPlan } from "./figure-routing";
import { readFiguresWithVision, visionConfigured, type VisionEnv } from "./vision";
import type { CapturedFigure } from "./structure";

export interface FigureLookReport {
  /** Figures the router chose. */
  routed: number;
  described: number;
  /** Routed, but no pixels were captured for them. */
  withoutPixels: number;
  /** Qualified and did not fit the budget — they keep `not-examined`. */
  overBudget: number;
}

export interface FigureLookResult {
  model: DocumentModel;
  report: FigureLookReport;
}

/**
 * Describe the figures worth describing, and fold the answers into the model.
 *
 * Never throws: a provider outage must leave a document that is still readable
 * and still honest about what was not looked at. The whole point of the coverage
 * contract is that a failure here shows up as a disclosed gap rather than as an
 * upload that did not happen.
 */
export async function lookAtFigures(
  model: DocumentModel,
  images: ReadonlyMap<string, CapturedFigure>,
  options: { env?: VisionEnv; signal?: AbortSignal; maxFigures?: number } = {},
): Promise<FigureLookResult> {
  const env = options.env ?? process.env;
  const plan: RoutingPlan = planFigureVision(model, { maxFigures: options.maxFigures });
  const empty: FigureLookReport = {
    described: 0,
    overBudget: plan.overBudget,
    routed: plan.candidates.length,
    withoutPixels: 0,
  };
  if (plan.candidates.length === 0) return { model, report: empty };

  if (!visionConfigured(env)) {
    // Say so on every routed figure. Leaving them untouched would report them as
    // "nobody looked", which is true of the provider and false of the router —
    // and it is the router's blind spot this phase exists to close.
    const results = new Map(
      plan.candidates.map((candidate) => [candidate.blockIndex, { skipped: "vision-unavailable" }]),
    );
    return { model: applyFigureDescriptions(model, results), report: empty };
  }

  const send: { name: string; mime: string; bytes: Uint8Array }[] = [];
  const results = new Map<number, { description?: string; skipped?: string }>();
  for (const candidate of plan.candidates) {
    const image = images.get(`${candidate.unit}:${candidate.ref}`);
    if (!image) {
      // Routed, but its pixels were never captured — a colour space this build
      // cannot convert, or a figure past the capture ceiling.
      results.set(candidate.blockIndex, { skipped: "unsupported" });
      continue;
    }
    // The block index is the key, so a description cannot land on the wrong
    // figure when two pages share an image name.
    send.push({ bytes: image.png, mime: "image/png", name: String(candidate.blockIndex) });
  }

  let described = new Map<string, string>();
  let labelled = new Map<string, FigureLabel[]>();
  // 🔴 FALSE UNTIL A REQUEST ACTUALLY COMES BACK. A throw below leaves it false, and so
  // does a model ladder that 404s all the way down — which is exactly what production was
  // doing while reporting every figure as `examined-empty`.
  let reached = false;
  try {
    // 🔴 `readFiguresWithVision`, NOT `describeFiguresWithVision` — SAME CALL, TWO ANSWERS (§46.6),
    // exactly the PPTX lane's rule. `describeFiguresWithVision` is a thin wrapper around this exact
    // request that keeps only `.descriptions` and throws `.labels` away — so a PDF diagram whose
    // parts vision named still arrived here with nothing to occlude, even after FIGURE_PROMPT
    // started asking for labels. No new call and no new cost: this is the request `lookAtFigures`
    // was already making.
    const seen = await readFiguresWithVision(send, { env, signal: options.signal });
    described = seen.descriptions;
    labelled = seen.labels;
    reached = seen.reached;
  } catch {
    // A provider failure is a disclosed gap, not a parse failure.
  }

  for (const image of send) {
    const text = described.get(image.name);
    const named = labelled.get(image.name);
    results.set(Number(image.name), {
      // 🔴 TWO DIFFERENT ABSENCES, AND THE VOCABULARY ALREADY HAD BOTH WORDS.
      // `examined-empty` means something looked and had nothing to say — a disclosed
      // decision about this picture. `vision-unavailable` means no request ever
      // succeeded, so nothing looked at anything. Calling the second one the first is
      // what let a completely dead model ladder report nine diagrams as examined, and it
      // is the same shape as every other silent degradation in this codebase: the
      // flattering reading of a missing value.
      ...(text ? { description: text } : { skipped: reached ? "examined-empty" : "vision-unavailable" }),
      ...(named && named.length > 0 ? { labels: named } : {}),
    });
  }

  return {
    model: applyFigureDescriptions(model, results),
    report: {
      described: [...results.values()].filter((r) => r.description).length,
      overBudget: plan.overBudget,
      routed: plan.candidates.length,
      withoutPixels: [...results.values()].filter((r) => r.skipped === "unsupported").length,
    },
  };
}
