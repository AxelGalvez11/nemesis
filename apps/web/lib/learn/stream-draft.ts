// What a streaming reply can show BEFORE it is finished: the model's own plan lines, and the
// answer's prose as it is written.
//
// 🔴🔴 THE TYPED TURN NEVER STREAMED, SO THE WAIT WAS ONE WORD. `postChatCompletion` streams only
// when a handler is attached, and the canvas attached one only on a spoken turn (to get the first
// sentence into the voice early). Every typed turn therefore sat behind a single shimmering
// "Thinking" for the model's whole latency and then landed all at once: the milestones the model
// wrote at the head of its reply could not be read until the reply was complete, which on a turn
// that never searches is the same instant as the answer. Owner, 2026-09-03: *"it should give like
// reasoning preview like every model does nowadays, like the reasoning summary... the shimmering
// plus the reasoning summary."*
//
// 🔴 THIS FILE READS THE STREAM AND NOTHING ELSE. It is the typed-turn twin of `spoken-opener.ts`:
// given the accumulated text so far, it says which milestones have closed (once) and how much
// answer prose exists outside the decision block. It never paraphrases anything, never invents a
// line, and never advances on a clock: a line appears because the model wrote it and it arrived.
//
// 🔴 PROSE IS DRAFTED ONLY FOR A PLAIN REPLY. A round that decides to search or call tools has
// prose that is not the answer (or none); showing it and then replacing it would be a sentence
// that flickers. `plainReply` is the same judgement the spoken lane makes, for the same reason.
//
// PURE. No React, no I/O, no clock.

import { extractJson } from "./canvas-parse";
import { plainReply } from "./spoken-opener";
import { readMilestones } from "./turn-preview";

/** Where the decision block opens. Same fence `readTurnDecision` reads. */
const FENCE_OPEN = /```json\s*\n?/;
/** A reply this long with no block in sight is a model that ignored the envelope; the finished
 *  path treats the whole text as prose, and so does the draft. */
const NO_ENVELOPE_AFTER = 2000;
/** The milestones array inside a PARTIAL block: everything up to its closing bracket. */
const MILESTONES = /"milestones"\s*:\s*\[([\s\S]*?)\]/;
const SEARCHING = /"needsWeb"\s*:\s*true/;

export interface StreamDraft {
  /** The model's milestone lines, the FIRST time their array closes; null on every other call. */
  readonly milestones: readonly string[] | null;
  /** The answer's prose so far, outside the block. Empty until it is safe to show any. */
  readonly prose: string;
}

export interface DraftWatch {
  feed(accumulated: string): StreamDraft;
}

export function draftWatch(): DraftWatch {
  let milestonesSent = false;
  return {
    feed(accumulated: string): StreamDraft {
      const open = FENCE_OPEN.exec(accumulated);
      if (!open) {
        return {
          milestones: null,
          prose: accumulated.length > NO_ENVELOPE_AFTER ? accumulated.trim() : "",
        };
      }
      const bodyStart = open.index + open[0].length;
      const close = accumulated.indexOf("```", bodyStart);
      const body = close === -1 ? accumulated.slice(bodyStart) : accumulated.slice(bodyStart, close);

      let milestones: readonly string[] | null = null;
      if (!milestonesSent) {
        const found = MILESTONES.exec(body);
        if (found) {
          let list: unknown = null;
          try {
            list = JSON.parse(`[${found[1] ?? ""}]`);
          } catch {
            list = null;
          }
          if (Array.isArray(list)) {
            milestonesSent = true;
            milestones = readMilestones(list, SEARCHING.test(body));
          }
        }
      }

      if (close === -1) return { milestones, prose: "" };
      const decision = extractJson(body);
      if (!decision || !plainReply(decision)) return { milestones, prose: "" };
      // Same assembly `readTurnDecision` performs: everything outside the block is the answer. The
      // blank lines the fence leaves behind are folded so the draft and the finished text agree.
      const prose = (accumulated.slice(0, open.index) + "\n" + accumulated.slice(close + 3)).replace(/\n{3,}/g, "\n\n").trim();
      return { milestones, prose };
    },
  };
}
