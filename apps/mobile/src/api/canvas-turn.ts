// The web app's conversational canvas turn, run on the phone.
//
// This mirrors `askCanvasChat` (apps/web/components/workspace/learn/canvas-chat.ts) step for
// step: the same packet (`turnRouterMessages`), the same model and route, the same decision
// parser (`decisionOrReply`), the same search loop (the model asks for the web, the phone fetches
// it through the same edge function the web does, the model reads the numbered pages and answers
// with `[n]` markers), the same course gate, and the pair is recorded as the same `assistant`
// moment. What the web does that the phone does not yet: pinned document comments, connected-app
// tools, the literature indexes, the `study` branch (a lesson from the teaching policy), figure /
// plot / structure resolution (`prepareAnswer`) and the deliverable makers. Each is named where it
// would go, so the next slice adds a seam rather than rediscovering the shape.
//
// 🔴 THE MODULES ARE THE WEB'S, IMPORTED (src/learn/turn.ts). The packet text, the reply schema
// and the parser have one copy; the phone supplies I/O only: the model call, the search, the
// memory read, the project read, persistence.

import type { ChatRouteDecision } from "@nemesis/shared";

import { completeMessages, searchWebContext } from "./chat";
import { loadCanvas, saveCanvas } from "./canvases";
import { supabase } from "./supabase";
import {
  courseGate,
  decisionOrReply,
  groundingBlock,
  HISTORY_TURNS,
  loadMemory,
  memoryBlock,
  sourceDisagreementInstruction,
  turnRouterMessages,
  type TurnDecision,
} from "@/learn/turn";
import type { ComposerCapability, LearningCanvas } from "@/learn/web";
import { nextMomentId, withExchange } from "@/lib/canvases";
import { formatWebSearchContext, type ChatSource } from "@/lib/chat-thread";
import { citedSources, exchangesFromCanvas, roundContinues, visibleProse, withoutFigureMarkers, type NumberedSource } from "@/lib/turn-text";

/** The web's `CHAT_DECISION`: the conversation route on the chat model, no forced search. */
const CHAT_DECISION: ChatRouteDecision = { route: "conversation", model: "deepseek-chat", searchWeb: false };

/** The web's backstop: the most searches one turn may run. Stated to the model as `searchesLeft`. */
const MAX_SEARCH_ROUNDS = 4;

export interface CanvasTurnOptions {
  signal?: AbortSignal;
  /** The visible prose so far — never the decision block (see `visibleProse`). */
  onDelta?: (prose: string) => void;
  /** A search went out (`null`) / results are in hand (running count + hosts). The web's two beats. */
  onSearching?: (found: number | null, domains: readonly string[]) => void;
  /** What the model said it would be doing, as soon as its decision is read. */
  onMilestones?: (milestones: readonly string[]) => void;
  /** The learner spoke these words in a voice conversation. */
  spoken?: boolean;
  /** The capability staged on this submission, if any. Only `course` reaches the packet today. */
  capability?: ComposerCapability | null;
}

export interface CanvasTurnOutcome {
  canvas: LearningCanvas;
  /** The answer as the screen shows it: the model's prose without figure markers. */
  reply: string | null;
  errorText: string | null;
  aborted: boolean;
  /** Pages the answer cites, in citation order; empty when it cites nothing. */
  sources: NumberedSource[];
  /** Every page the model was shown, in the numbering it read — the honest "consulted" list. */
  consulted: NumberedSource[];
  decision: TurnDecision | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hostsOf(sources: readonly ChatSource[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    const host = hostOf(source.url);
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/** The project this canvas is filed in, as the packet states it — the web's `loadProjectInstructions`. */
async function projectInstructionsFor(uid: string, canvasId: string): Promise<string> {
  const { data, error } = await supabase
    .from("learning_canvases")
    .select("folder_id, folders(name, instructions)")
    .eq("id", canvasId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return "";
  const folder = (data as { folders?: { name?: string | null; instructions?: string | null } | null }).folders;
  if (!folder?.name || !folder.instructions?.trim()) return "";
  return `The project is called "${folder.name}".\n${folder.instructions.trim()}`;
}

async function recordExchange(
  uid: string,
  canvas: LearningCanvas,
  exchange: { userText: string; assistantText: string; spoken?: boolean },
): Promise<LearningCanvas> {
  // Re-read before writing, for the reason api/canvases.ts gives: the phone's copy may be stale.
  const fresh = (await loadCanvas(uid, canvas.id)) ?? canvas;
  const next = withExchange(fresh, exchange, new Date().toISOString(), nextMomentId(fresh));
  if (next !== fresh) await saveCanvas(uid, next);
  return next;
}

/**
 * One conversational turn on a canvas, the web's way.
 *
 * Streams the prose to `onDelta`, fetches the web when the model asks, records the pair once, and
 * returns the canvas the web will open. A failed turn records nothing. Stop records the visible
 * partial prose once when there is any, exactly as api/canvases.ts's plain turn does.
 */
export async function runCanvasTurn(
  uid: string,
  canvas: LearningCanvas,
  text: string,
  options: CanvasTurnOptions = {},
): Promise<CanvasTurnOutcome> {
  const said = text.trim();
  const untouched = (errorText: string | null, aborted = false): CanvasTurnOutcome => ({
    canvas,
    reply: null,
    errorText,
    aborted,
    sources: [],
    consulted: [],
    decision: null,
  });
  if (!said) return untouched(null);

  const materialContext = groundingBlock(canvas.sources);
  const [memoryRows, projectInstructions] = await Promise.all([
    loadMemory(uid).catch(() => []),
    projectInstructionsFor(uid, canvas.id).catch(() => ""),
  ]);
  const memory = memoryBlock(memoryRows);
  const history = exchangesFromCanvas(canvas, HISTORY_TURNS);
  const courseRequested = options.capability === "course";

  let streamed = "";
  const ask = (webContext: string, searchesLeft: number) =>
    completeMessages(
      uid,
      turnRouterMessages({
        context: {
          canvasTitle: canvas.title,
          clarified: [],
          courseRequested,
          demonstrated: 0,
          history,
          lessonInProgress: false,
          materialContext,
          memory,
          objectives: 0,
          passages: canvas.blocks.length,
          // Pinned document comments, connected-app tools: web-only for now (see the header).
          pinnedComments: "",
          projectInstructions,
          searchesLeft,
          sources: canvas.sources.length,
          spokenConversation: Boolean(options.spoken),
          stagedPassage: "",
          today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
          toolCatalogue: "",
          toolContext: "",
          toolRoundsLeft: 0,
          webContext,
        },
        sourceRule: sourceDisagreementInstruction({
          hasAttachedMaterial: materialContext.trim().length > 0,
          hasExternalEvidence: webContext.trim().length > 0,
        }),
        utterance: said,
      }),
      {
        decision: CHAT_DECISION,
        signal: options.signal,
        onDelta: (_delta, accumulated) => {
          streamed = accumulated;
          // A round that has decided to search is not the answer; its prose stays off screen.
          if (roundContinues(accumulated)) return;
          options.onDelta?.(visibleProse(accumulated));
        },
      },
    );

  const readDecision = (raw: string): TurnDecision | null => {
    const read = decisionOrReply(raw);
    if (__DEV__) {
      // What the model asked for, in Metro's console — the one place a phone turn can be watched.
      console.log("[canvas-turn] decision", read
        ? { then: read.then, needsWeb: read.needsWeb, webQuery: read.webQuery, webResults: read.webResults, milestones: read.milestones, sayChars: read.say?.length ?? 0 }
        : { parsed: false, head: raw.slice(0, 120) });
    }
    options.onMilestones?.(read?.milestones ?? []);
    return read;
  };

  const first = await ask("", MAX_SEARCH_ROUNDS);
  if (options.signal?.aborted) return stopped();
  if (first.errorText) return untouched(first.errorText);
  let decision = first.text ? readDecision(first.text) : null;

  // The web's search loop, minus the literature and tool halves.
  const gathered: ChatSource[] = [];
  const seen = new Set<string>();
  for (let round = 0; round < MAX_SEARCH_ROUNDS && decision?.needsWeb; round += 1) {
    options.onSearching?.(null, []);
    const found = await searchWebContext(uid, decision.webQuery || said, decision.webResults ?? null, decision.webFreshness ?? null);
    if (__DEV__) console.log("[canvas-turn] search", { query: decision.webQuery || said, found: found.sources.length, contextChars: found.context.length });
    for (const source of found.sources) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      gathered.push(source);
    }
    options.onSearching?.(gathered.length, hostsOf(gathered));
    const next = await ask(formatWebSearchContext(gathered), MAX_SEARCH_ROUNDS - round - 1);
    if (options.signal?.aborted) return stopped();
    if (next.errorText) return untouched(next.errorText);
    // A failed round leaves the previous answer standing (the web's rule); a null decision cannot
    // ask for another search, so the loop ends.
    decision = (next.text ? readDecision(next.text) : null) ?? decision;
    if (!next.text) break;
  }

  if (decision) decision = courseGate(decision, courseRequested);
  const say = decision?.say?.trim() ?? "";
  if (!say) return untouched("The answer came back empty. Try again.");

  const numbered: NumberedSource[] = gathered.map((source) => ({ title: source.title, url: source.url }));
  const next = await recordExchange(uid, canvas, {
    userText: said,
    assistantText: say,
    ...(options.spoken ? { spoken: true } : {}),
  });
  return {
    canvas: next,
    reply: withoutFigureMarkers(say),
    errorText: null,
    aborted: false,
    sources: citedSources(say, numbered),
    consulted: numbered,
    decision,
  };

  async function stopped(): Promise<CanvasTurnOutcome> {
    const partial = roundContinues(streamed) ? "" : withoutFigureMarkers(visibleProse(streamed));
    if (!partial) return untouched(null, true);
    const kept = await recordExchange(uid, canvas, {
      userText: said,
      assistantText: partial,
      ...(options.spoken ? { spoken: true } : {}),
    });
    return { ...untouched(null, true), canvas: kept, reply: partial };
  }
}
