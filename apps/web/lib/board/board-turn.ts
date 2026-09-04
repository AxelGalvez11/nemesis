// One card's turn: the question goes to the model through the SAME door every chat surface uses,
// the answer streams back into the card, and the machine blocks at its tail become the card's
// title, summary and suggested questions.
//
// Wondering does this in an edge function (`canvas-chat`) that emits typed SSE events —
// content / citations / summary / suggestions / final (docs/wondering-canvas-reference.md §8). Ours
// is the same protocol carried IN the answer text: the model appends `[[SUMMARY]]` and `[[SUGGEST]]`
// blocks, `board-protocol.ts` strips them from what the learner sees and reads them once the
// stream ends. One model call per turn, no second call for suggestions.
//
// 🔴 `postChatCompletion` IS THE DOOR. Same device key, same cost header, same daily budget as the
// chat. A board that reached the model any other way would be the hole the unit-economics audit
// found once already (see lib/learn/canvas-api.ts's header).

"use client";

import { THINKING_STANCE } from "@nemesis/shared";

import { postChatCompletion, searchWebContext, type WireMsg } from "@/lib/workspace/chat-api";
import { formatWebSearchContext, type ChatWebResult } from "@/lib/workspace/chat-web-search";
import type { BoardCitation, BoardSource, BoardSuggestions } from "./board-model";
import { CONCEPT_INSTRUCTION, PROTOCOL_INSTRUCTION, readSuggestions, readSummary, visibleAnswer } from "./board-protocol";

/** Wondering's limits for pasted sources, kept so a board behaves the same at the edges. */
export const MAX_SOURCES_PER_MESSAGE = 4;
export const MAX_SOURCE_CONTENT_CHARACTERS = 240_000;
export const MAX_TOTAL_SOURCE_CHARACTERS = 480_000;
export const TRUNCATED_SOURCE_NOTICE = "\n\n[This source was truncated to fit the canvas context window.]";

export const DIVE_DEEPER_MESSAGE =
  "Dive deeper into the highlighted excerpt: explain it more thoroughly and surface what matters most about it.";

export type BoardResponseMode = "answer" | "lesson";

export interface BoardTurnInput {
  uid: string;
  message: string;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  contextExcerpt?: string;
  sources?: readonly BoardSource[];
  responseMode?: BoardResponseMode;
  useWebSearch?: boolean;
  cardTitle?: string;
  cardSummary?: string;
  signal?: AbortSignal;
  /** The visible answer so far (protocol blocks already stripped). */
  onContent?: (visible: string) => void;
  onSearching?: (searching: boolean) => void;
}

export interface BoardTurnResult {
  content: string;
  citations: BoardCitation[];
  suggestions: BoardSuggestions;
  title?: string;
  summary?: string;
  truncated: boolean;
  error: string | null;
}

const SYSTEM_HEAD =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the learner's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  "Never use emojis. Never use em dashes; use a comma, a colon, or a new sentence. " +
  "This conversation is one card on a visual board where the learner explores several threads side by side; keep each answer self-contained and readable on its own. " +
  // 🔴 THE STANCE RIDES EVERY SURFACE THAT SPEAKS AS NEMESIS (every-surface-has-a-stance.test.ts).
  THINKING_STANCE;

/** Appended to every user turn: the last thing the model reads before it writes. */
const TURN_TAIL = "\n\n(Reply in full, mark key terms as [term](#concept \"meaning\") links, then end with the [[SUMMARY]] and [[SUGGEST]] blocks.)";

/** How much room a board answer may take. The provider's default cut long answers before the
 *  machine blocks at their tail; the deck writer learned the same lesson at 8192. */
const BOARD_MAX_TOKENS = 8192;

const LESSON_MODE =
  "The learner asked for a lesson from a source: teach it in order, with headings for its main ideas, one worked example per idea, and a short check-yourself list at the end.";

/** The sources that ride this question, pasted and truncated to Wondering's limits. */
export function pastedSources(sources: readonly BoardSource[], sourceIds: readonly string[]): Array<{ type: string; name: string; content: string }> {
  const out: Array<{ type: string; name: string; content: string }> = [];
  let budget = MAX_TOTAL_SOURCE_CHARACTERS;
  for (const id of sourceIds) {
    const source = sources.find((item) => item.id === id && item.status === "ready");
    if (!source || budget <= 0) continue;
    const limit = Math.min(MAX_SOURCE_CONTENT_CHARACTERS, budget);
    const truncated = source.content.length > limit;
    const keep = truncated ? Math.max(0, limit - TRUNCATED_SOURCE_NOTICE.length) : limit;
    const content = `${source.content.slice(0, keep)}${truncated ? TRUNCATED_SOURCE_NOTICE : ""}`;
    out.push({ type: source.type, name: source.name, content });
    budget -= content.length;
  }
  return out;
}

export function boardWireMessages(input: {
  message: string;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  contextExcerpt?: string;
  sources?: Array<{ type: string; name: string; content: string }>;
  responseMode?: BoardResponseMode;
  cardTitle?: string;
  cardSummary?: string;
  webContext?: string;
}): WireMsg[] {
  const system: string[] = [SYSTEM_HEAD];
  if (input.responseMode === "lesson") system.push(LESSON_MODE);
  if (input.cardTitle) system.push(`This card is titled "${input.cardTitle}".${input.cardSummary ? ` So far: ${input.cardSummary}` : ""}`);
  if (input.sources?.length) {
    system.push(
      "The learner attached these sources. Ground the answer in them and say when they do not cover the question:\n\n" +
        input.sources.map((source) => `### ${source.name} (${source.type})\n${source.content}`).join("\n\n"),
    );
  }
  if (input.webContext) {
    system.push("Live web results for this question. Use them for current facts and cite the relevant URLs as [n]:\n\n" + input.webContext);
  }
  system.push(CONCEPT_INSTRUCTION);
  system.push(PROTOCOL_INSTRUCTION);
  const question = input.contextExcerpt
    ? `The learner selected this passage from the previous answer:\n\n> ${input.contextExcerpt.replace(/\n/g, "\n> ")}\n\nTheir question about it: ${input.message}`
    : input.message;
  // 🔴 THE REMINDER RIDES THE USER TURN, NOT ONLY THE SYSTEM PROMPT. Verified on production
  // 2026-09-03: with the stance, sixteen web results and a long answer in front of it, DeepSeek
  // followed the protocol from a short system prompt and dropped it from the long one. The same
  // model wrote both blocks every time once the last thing it read was the ask.
  const user = `${question}${TURN_TAIL}`;
  return [
    { role: "system", content: system.join("\n\n") },
    ...input.history.map((turn) => ({ role: turn.role, content: turn.content }) as WireMsg),
    { role: "user", content: user },
  ];
}

function citationsFrom(results: readonly ChatWebResult[], answer: string): BoardCitation[] {
  // Only the results the answer actually cited as [n], in the order first cited.
  const cited: BoardCitation[] = [];
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const index = Number(match[1]) - 1;
    const result = results[index];
    if (!result || seen.has(index)) continue;
    seen.add(index);
    cited.push({ url: result.url, title: result.title || result.url });
  }
  return cited;
}

export async function runBoardTurn(input: BoardTurnInput): Promise<BoardTurnResult> {
  let webContext = "";
  let webResults: ChatWebResult[] = [];
  if (input.useWebSearch) {
    input.onSearching?.(true);
    try {
      const searched = await searchWebContext(input.uid, input.message, input.signal);
      webResults = searched.sources;
      webContext = searched.sources.length ? formatWebSearchContext(searched.sources) : searched.context;
    } catch {
      webContext = "";
    } finally {
      input.onSearching?.(false);
    }
  }
  const messages = boardWireMessages({
    message: input.message,
    history: input.history,
    contextExcerpt: input.contextExcerpt,
    sources: input.sources ? pastedSources(input.sources, input.sources.map((source) => source.id)) : undefined,
    responseMode: input.responseMode,
    cardTitle: input.cardTitle,
    cardSummary: input.cardSummary,
    webContext,
  });
  let raw = "";
  const reply = await postChatCompletion(input.uid, messages, {
    signal: input.signal,
    maxTokens: BOARD_MAX_TOKENS,
    onDelta: (_delta, accumulated) => {
      raw = accumulated;
      input.onContent?.(visibleAnswer(accumulated, true));
    },
  });
  if (reply.errorKind || !reply.text) {
    return {
      content: visibleAnswer(raw, false),
      citations: [],
      suggestions: { followUps: [], branches: [], newThreads: [] },
      truncated: false,
      error: reply.errorText ?? "Something went wrong answering this. Try again.",
    };
  }
  const full = reply.text;
  const content = visibleAnswer(full, false);
  let summary = readSummary(full);
  let suggestions = readSuggestions(full);
  const hasSuggestions = suggestions.followUps.length + suggestions.branches.length + suggestions.newThreads.length > 0;
  if (!hasSuggestions || !summary.title) {
    // The blocks did not arrive. One small, non-streaming call asks for nothing else, so the card
    // still gets its title and its next questions rather than a bare answer.
    const recovered = await recoverBlocks(input.uid, input.message, content, input.signal);
    if (recovered) {
      if (!hasSuggestions) suggestions = readSuggestions(recovered);
      if (!summary.title) summary = readSummary(recovered);
    }
  }
  return {
    content,
    citations: citationsFrom(webResults, content),
    suggestions,
    ...summary,
    truncated: false,
    error: null,
  };
}

async function recoverBlocks(uid: string, question: string, answer: string, signal?: AbortSignal): Promise<string | null> {
  const reply = await postChatCompletion(
    uid,
    [
      { role: "system", content: "You write two machine blocks about a question and its answer, and nothing else. " + PROTOCOL_INSTRUCTION },
      { role: "user", content: `Question:\n${question}\n\nAnswer:\n${answer.slice(0, 6000)}\n\nWrite only the [[SUMMARY]] and [[SUGGEST]] blocks.` },
    ],
    { signal, maxTokens: 600, background: true },
  );
  return reply.text ?? null;
}
