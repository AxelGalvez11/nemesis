// What a chat reads: whatever is ticked in the Sources panel.
//
// 🔴🔴🔴 THIS FILE ARGUED FOR GEOMETRY FOR ONE DAY, AND BOTH ANSWERS ARE THE OWNER'S. On 2026-09-07
// he was given three shapes for the group and chose *"A frame, and whatever sits in it is what
// chats read"*, knowing the cost, which was put to him in writing: dragging a card two inches
// changes what a chat answers from. It shipped that way (#1177). Later the same day, in three
// messages:
//
//     *"adding documents still loads them on canvas, please remove that"*
//     *"so all chats should contain all sources"*
//     *"thats why we have tickers"*
//
// So: a canvas holds its sources in the PANEL, every chat on it is attached to all of them, and the
// TICK BOXES are how a learner narrows that. Which is NotebookLM's own model, the reference he has
// been copying all day, and it is the shape this code had before the frame rule was built.
//
// 🔴 THE FIRST MESSAGE IS WHAT KILLED THE FRAME RULE, NOT THE THIRD. With documents living only in
// the panel there is nothing on the board for a frame to contain, so a geometric scope had no
// inputs at all. The ticks are not a replacement for it; they are what was always there.
//
// 🔴 WHAT CAME DOWN, NAMED SO A `git log -S` FINDS IT AT 5d9311b0 AND BEFORE: `groupContaining`
// (innermost frame by area), `scopeForCard`, `scopeLabel`, `groupHoldingExactly`, the
// `attachedSourceId` rule that kept a question dragged off one PDF reading that PDF, the
// gather-onto-clear-ground step in `ensureTickGroup`, and `data-card-scope` on the conversation
// card. That last was the whole defence of the geometric rule: the card printed what it read, so a
// drag that changed an answer changed a line on screen at the same moment. The panel is now the one
// place that says what is active, and it says it for the whole canvas.
//
// 🔴 FRAMES DID NOT GO. Obsidian groups still draw, hold by geometry, colour and fold
// (`board-groups.ts`). They arrange the board. They no longer decide anything about retrieval.
//
// PURE. No React, no I/O.

export interface ScopedSource {
  readonly id: string;
  readonly status: string;
}

/**
 * The sources every chat on this canvas is answered from.
 *
 * 🔴🔴 NOTHING TICKED MEANS EVERYTHING, NEVER NOTHING, and that rule is older than this file. A
 * learner who unticks the last box has not asked to be answered from thin air; every board saved
 * before ticks existed has an empty list and must keep working; and a canvas whose panel is closed
 * should behave as though the whole of it is in play. `ticksOf` seeds the panel from the same rule
 * on load, so what is on screen and what is sent agree.
 *
 * 🔴 A TICK ON SOMETHING STILL BEING READ IS NOT A SOURCE YET. Only `ready` is sent: a document
 * mid-parse has no text to ground in, and one that failed has none at all.
 */
export function activeSourceIds(sources: readonly ScopedSource[], ticked: readonly string[]): string[] {
  const ready = sources.filter((source) => source.status === "ready").map((source) => source.id);
  if (ticked.length === 0) return ready;
  const wanted = new Set(ticked);
  const chosen = ready.filter((id) => wanted.has(id));
  return chosen.length > 0 ? chosen : ready;
}
