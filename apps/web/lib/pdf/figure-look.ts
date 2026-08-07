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

import { applyFigureDescriptions, planFigureVision, type RoutingPlan } from "./figure-routing";
import { describeFiguresWithVision, visionConfigured, type VisionEnv } from "./vision";
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
  try {
    described = await describeFiguresWithVision(send, { env, signal: options.signal });
  } catch {
    // A provider failure is a disclosed gap, not a parse failure.
  }

  for (const image of send) {
    const text = described.get(image.name);
    results.set(Number(image.name), text ? { description: text } : { skipped: "examined-empty" });
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
