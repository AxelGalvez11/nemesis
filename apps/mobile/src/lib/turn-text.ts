// Pure helpers around the web's conversational turn, for the phone. No React, no I/O.
//
// The web's `turnRouterMessages` wants the recent conversation as `TurnExchange`s and its reply
// arrives as a fenced JSON decision block followed by prose (`decisionOrReply` parses it once it
// is whole). While it streams, the learner must see the prose and never the JSON — the web's
// dock shows "Thinking" until the block closes. `visibleProse` is that rule as a function.

import type { LearningCanvas } from "../learn/web.ts";
import { threadFromCanvas } from "./canvases.ts";

export interface Exchange {
  said: string;
  replied: string;
}

/** The last `limit` exchanges of a canvas's conversation, oldest first — what the packet carries
 *  as history. Turns with no learner words (a lesson the app opened by itself) are skipped: the
 *  model reads history as question/answer pairs. */
export function exchangesFromCanvas(canvas: LearningCanvas, limit: number): Exchange[] {
  const out: Exchange[] = [];
  for (const turn of threadFromCanvas(canvas)) {
    const said = turn.said?.trim() ?? "";
    const replied = turn.reply.trim();
    if (!said || !replied) continue;
    out.push({ said, replied });
  }
  return out.slice(-Math.max(0, limit));
}

const FENCE_OPEN = /^\s*```(?:json)?\s*\n/;

/**
 * What of a streaming reply can be shown so far.
 *
 * The reply opens with a fenced ```json decision block. Until that fence CLOSES nothing is shown
 * (an empty string — the caller keeps its "Thinking" line up); once it closes, everything after it
 * is prose and streams as it arrives. A reply that never opens a fence is all prose from the first
 * byte. A fence that opens later in the text (the model wrote prose first) is left alone: the
 * parser decides what that means once the reply is whole.
 */
export function visibleProse(accumulated: string): string {
  if (!FENCE_OPEN.test(accumulated)) return accumulated;
  const opened = accumulated.match(FENCE_OPEN)!;
  const rest = accumulated.slice(opened[0].length);
  const close = rest.indexOf("\n```");
  if (close < 0) return "";
  return rest.slice(close + "\n```".length).replace(/^\s+/, "");
}

/** `[figure n]` markers point at drawings the phone does not render yet; the sentence reads
 *  without them. Doubled spaces left behind are collapsed. */
export function withoutFigureMarkers(say: string): string {
  return say
    .replace(/\s*\[figure\s+\d+\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export interface NumberedSource {
  title: string;
  url: string;
}

/**
 * The pages an answer actually cites, in the order it first cites them.
 *
 * 🔴 RESOLVED AGAINST THE NUMBERED LIST THE MODEL WAS SHOWN, NEVER AGAINST THIS FUNCTION'S OWN
 * OUTPUT. An `[n]` is an index into what the model read; the list this returns is in citation
 * order and its positions mean nothing (the web's `citedWebResults` carries the same warning, and
 * a near-miss with it once almost shipped misattributed citations). Markers out of range are
 * ignored. An answer that cites nothing returns an empty list — the caller decides what to show.
 */
export function citedSources(say: string, numbered: readonly NumberedSource[]): NumberedSource[] {
  const out: NumberedSource[] = [];
  const seen = new Set<string>();
  for (const match of say.matchAll(/\[(\d{1,3})\]/g)) {
    const index = Number(match[1]) - 1;
    const source = numbered[index];
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    out.push(source);
  }
  return out;
}
