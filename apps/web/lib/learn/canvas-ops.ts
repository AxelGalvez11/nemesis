// What the model is allowed to do to the page, and the check that enforces it.
//
// 🔴 WHY THIS FILE IS STRICTER THAN THE REST OF NEMESIS.
//
// Nothing else in this repo validates model output against the shape it was asked for. The
// agent-tool path coerces instead: a missing required `title` becomes "" and a note is saved
// as "Untitled note" with nobody told. That is survivable for a chat tool. It is not
// survivable for a page that rewrites itself — a coerced op silently deletes a learner's
// lesson or empties the document.
//
// So every operation is checked against the canvas it will be applied to BEFORE anything
// moves: the block must exist, the concept must be one the canvas declared, the citation must
// resolve to a real excerpt, and a selection-scoped command may not reach outside its
// selection. Anything that fails is dropped with a reason, and the rest still applies.
//
// The client never executes model-generated code. It executes this closed list of verbs.

import {
  CANVAS_BLOCK_TYPES,
  CANVAS_STATES,
  type CanvasBlock,
  type CanvasBlockType,
  type CanvasState,
  type LearningCanvas,
  type SourceRef,
} from "./canvas-model";
import { canTransition } from "./canvas-state";

/** A block the model proposes. It never chooses ids — we mint those, so a model cannot
 *  collide with or impersonate an existing block. */
export interface ProposedBlock {
  type: CanvasBlockType;
  content: string;
  sourceRefs?: SourceRef[];
  conceptIds?: string[];
}

export type CanvasOp =
  | { operation: "replace_block"; blockId: string; content: string; sourceRefs?: SourceRef[]; conceptIds?: string[] }
  | { operation: "insert_before"; blockId: string; block: ProposedBlock }
  | { operation: "insert_after"; blockId: string; block: ProposedBlock }
  | { operation: "delete_block"; blockId: string }
  | { operation: "collapse_block"; blockId: string; collapsed: boolean }
  | { operation: "annotate_block"; blockId: string; note: string }
  | { operation: "rewrite_section"; blockIds: string[]; blocks: ProposedBlock[] }
  | { operation: "replace_canvas"; blocks: ProposedBlock[] }
  | { operation: "transition_state"; to: CanvasState };

export const CANVAS_OPERATIONS = [
  "replace_block",
  "insert_before",
  "insert_after",
  "delete_block",
  "collapse_block",
  "annotate_block",
  "rewrite_section",
  "replace_canvas",
  "transition_state",
] as const;

/** One command must not be able to rewrite a book. Sixty is far above any honest edit and far
 *  below a runaway. */
const MAX_OPS = 60;

/** Operations that redraw the whole page. Never available to a command the learner scoped to
 *  a selection — "simplify this sentence" must not be able to answer by replacing everything. */
const WHOLE_CANVAS_OPS: ReadonlySet<string> = new Set(["replace_canvas", "rewrite_section"]);

export interface RejectedOp {
  op: unknown;
  reason: string;
}

export interface ValidationResult {
  ops: CanvasOp[];
  rejected: RejectedOp[];
}

export interface ValidateOptions {
  /** When present, the command came from a text selection and may only touch these blocks
   *  (or insert immediately beside them). */
  scopeBlockIds?: readonly string[];
  /** Permits whole-canvas verbs. Set only for the lesson generator and targeted relearning. */
  allowWholeCanvas?: boolean;
}

// -------------------------------------------------------------------- parsing

/** Pull an operations payload out of whatever the model actually said.
 *
 *  There is no JSON mode on this lane — `response_format` is not handled by the nemesis-llm
 *  valve and no caller in the repo has ever sent it. So the model answers in prose-with-JSON
 *  and we extract defensively: fenced block first, then a bare object or array. Anything we
 *  cannot parse yields no operations, which leaves the page untouched. Never throws. */
export function parseCanvasOps(raw: string): CanvasOp[] {
  for (const candidate of jsonCandidates(raw)) {
    const parsed = tryParse(candidate);
    if (!parsed) continue;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { operations?: unknown }).operations)
        ? (parsed as { operations: unknown[] }).operations
        : null;
    if (list) return list.filter((entry): entry is CanvasOp => isRecord(entry));
  }
  return [];
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Fenced code blocks first (models wrap JSON in them constantly), then the widest balanced
 *  object or array in the text. */
function jsonCandidates(raw: string): string[] {
  const out: string[] = [];
  for (const match of raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)) {
    const body = match[1]?.trim();
    if (body) out.push(body);
  }
  const trimmed = raw.trim();
  if (trimmed) out.push(trimmed);
  for (const open of ["{", "["]) {
    const start = raw.indexOf(open);
    const end = raw.lastIndexOf(open === "{" ? "}" : "]");
    if (start >= 0 && end > start) out.push(raw.slice(start, end + 1));
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ----------------------------------------------------------------- validation

export function validateOps(
  canvas: Pick<LearningCanvas, "blocks" | "concepts" | "sources" | "state">,
  ops: readonly unknown[],
  options: ValidateOptions = {},
): ValidationResult {
  const accepted: CanvasOp[] = [];
  const rejected: RejectedOp[] = [];

  // A refusal is one refusal, not sixty: an over-long batch is a broken generation, and
  // partially applying it would leave a document nobody asked for.
  if (ops.length > MAX_OPS) {
    return { ops: [], rejected: [{ op: null, reason: `Too many changes at once (${ops.length}).` }] };
  }

  const knownBlocks = new Set(canvas.blocks.map((block) => block.id));
  const knownConcepts = new Set(canvas.concepts.map((concept) => concept.id));
  const scope = options.scopeBlockIds ? new Set(options.scopeBlockIds) : null;

  for (const raw of ops) {
    const problem = checkOp(raw, { canvas, knownBlocks, knownConcepts, scope, options });
    if (problem) rejected.push({ op: raw, reason: problem });
    else {
      const op = raw as CanvasOp;
      accepted.push(op);
      // Track structural changes within the batch so a later op cannot name a block an
      // earlier op removed, and CAN name one an earlier op created.
      if (op.operation === "delete_block") knownBlocks.delete(op.blockId);
      if (op.operation === "rewrite_section") for (const id of op.blockIds) knownBlocks.delete(id);
    }
  }

  return { ops: accepted, rejected };
}

interface CheckContext {
  canvas: Pick<LearningCanvas, "blocks" | "concepts" | "sources" | "state">;
  knownBlocks: Set<string>;
  knownConcepts: Set<string>;
  scope: Set<string> | null;
  options: ValidateOptions;
}

/** Returns a human reason when the op is not allowed, or null when it is. */
function checkOp(raw: unknown, ctx: CheckContext): string | null {
  if (!isRecord(raw)) return "Not an operation.";
  const operation = raw.operation;
  if (typeof operation !== "string" || !(CANVAS_OPERATIONS as readonly string[]).includes(operation)) {
    return `Unknown operation ${JSON.stringify(operation)}.`;
  }

  if (WHOLE_CANVAS_OPS.has(operation)) {
    if (ctx.scope) return `${operation} is not permitted for a change scoped to a selection.`;
    if (operation === "replace_canvas" && !ctx.options.allowWholeCanvas) {
      return "replace_canvas is not permitted here.";
    }
  }

  switch (operation) {
    case "transition_state": {
      const to = raw.to;
      if (typeof to !== "string" || !(CANVAS_STATES as readonly string[]).includes(to)) return "Unknown state.";
      if (!canTransition(ctx.canvas.state, to as CanvasState)) {
        return `Cannot move from ${ctx.canvas.state} to ${to}.`;
      }
      return null;
    }

    case "replace_canvas": {
      const blocks = raw.blocks;
      // An empty replace_canvas is how a bad generation erases a lesson. Never allowed.
      if (!Array.isArray(blocks) || blocks.length === 0) return "replace_canvas needs at least one block.";
      return firstBlockProblem(blocks, ctx);
    }

    case "rewrite_section": {
      const ids = raw.blockIds;
      if (!Array.isArray(ids) || ids.length === 0) return "rewrite_section needs blockIds.";
      for (const id of ids) {
        if (typeof id !== "string" || !ctx.knownBlocks.has(id)) return `Unknown block ${JSON.stringify(id)}.`;
      }
      const blocks = raw.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0) return "rewrite_section needs replacement blocks.";
      return firstBlockProblem(blocks, ctx);
    }

    case "insert_before":
    case "insert_after": {
      const anchor = blockProblem(raw.blockId, ctx);
      if (anchor) return anchor;
      if (!isRecord(raw.block)) return "Missing block.";
      return firstBlockProblem([raw.block], ctx);
    }

    case "replace_block": {
      const anchor = blockProblem(raw.blockId, ctx);
      if (anchor) return anchor;
      if (typeof raw.content !== "string" || raw.content.trim() === "") return "Empty content.";
      return refProblem(raw.sourceRefs, ctx) ?? conceptProblem(raw.conceptIds, ctx);
    }

    case "annotate_block": {
      const anchor = blockProblem(raw.blockId, ctx);
      if (anchor) return anchor;
      return typeof raw.note === "string" && raw.note.trim() !== "" ? null : "Empty note.";
    }

    case "collapse_block": {
      const anchor = blockProblem(raw.blockId, ctx);
      if (anchor) return anchor;
      return typeof raw.collapsed === "boolean" ? null : "collapsed must be true or false.";
    }

    case "delete_block":
      return blockProblem(raw.blockId, ctx);

    default:
      return `Unknown operation ${operation}.`;
  }
}

function blockProblem(id: unknown, ctx: CheckContext): string | null {
  if (typeof id !== "string" || !ctx.knownBlocks.has(id)) return `Unknown block ${JSON.stringify(id)}.`;
  if (ctx.scope && !ctx.scope.has(id)) return `Block ${id} is outside the selection.`;
  return null;
}

function firstBlockProblem(blocks: readonly unknown[], ctx: CheckContext): string | null {
  for (const block of blocks) {
    if (!isRecord(block)) return "Not a block.";
    if (typeof block.type !== "string" || !(CANVAS_BLOCK_TYPES as readonly string[]).includes(block.type)) {
      return `Unknown block type ${JSON.stringify(block.type)}.`;
    }
    if (typeof block.content !== "string" || block.content.trim() === "") return "Empty content.";
    const problem = refProblem(block.sourceRefs, ctx) ?? conceptProblem(block.conceptIds, ctx);
    if (problem) return problem;
  }
  return null;
}

/** A citation that does not resolve is worse than no citation — it is a claim of provenance
 *  the product cannot honour when the learner clicks it. */
function refProblem(refs: unknown, ctx: CheckContext): string | null {
  if (refs === undefined) return null;
  if (!Array.isArray(refs)) return "sourceRefs must be a list.";
  for (const ref of refs) {
    if (!isRecord(ref) || typeof ref.sourceId !== "string" || typeof ref.excerptId !== "string") {
      return "Malformed citation.";
    }
    const source = ctx.canvas.sources.find((candidate) => candidate.id === ref.sourceId);
    if (!source?.excerpts.some((excerpt) => excerpt.id === ref.excerptId)) {
      return `Citation ${ref.sourceId}/${ref.excerptId} does not match any excerpt.`;
    }
  }
  return null;
}

function conceptProblem(ids: unknown, ctx: CheckContext): string | null {
  if (ids === undefined) return null;
  if (!Array.isArray(ids)) return "conceptIds must be a list.";
  for (const id of ids) {
    if (typeof id !== "string" || !ctx.knownConcepts.has(id)) return `Unknown concept ${JSON.stringify(id)}.`;
  }
  return null;
}

// ---------------------------------------------------------------- application

let blockCounter = 0;

/** Ids are minted here, never accepted from the model. Prefixed and counter-suffixed so two
 *  inserts in one batch cannot collide. */
export function mintBlockId(): string {
  blockCounter += 1;
  return `b_${blockCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function materialise(proposed: ProposedBlock): CanvasBlock {
  return {
    id: mintBlockId(),
    type: proposed.type,
    content: proposed.content,
    ...(proposed.sourceRefs?.length ? { sourceRefs: proposed.sourceRefs } : {}),
    ...(proposed.conceptIds?.length ? { conceptIds: proposed.conceptIds } : {}),
  };
}

/** Apply validated ops. Immutable: returns a new canvas and never touches the one given.
 *  Assumes `validateOps` already ran — an op naming a missing block is a no-op here. */
/**
 * 🔴 §39 — ANY OPERATION THAT REPLACES WHAT THE LEARNER WOULD READ INVALIDATES `readAt`.
 *
 * `readAt` is a claim about CONTENT the learner has seen. It is NOT a claim about the block's
 * identity, and modelling it as the latter shipped a real defect: press Continue, ask for the
 * passage simpler, and the new wording arrived with no Continue under it — the learner's pacing
 * control lost as a cost of asking for help.
 *
 * 🔴 AND IT IS ENFORCED BY OBSERVATION, NOT BY A LIST OF OPERATIONS. The obvious fix is to clear
 * `readAt` in the `replace_block` branch and the `annotate_block` branch. That passes today and
 * strands a Continue the first time somebody adds a tenth operation — the guard would enumerate
 * the nine that existed when it was written and stay green forever. So this compares what the
 * block SAID before against what it says after, and clears the stamp wherever they differ. A new
 * operation is covered the moment it is written, without anyone remembering.
 *
 * Same reasoning as `continueOwner`: one owner beats several call sites agreeing.
 */
function invalidateReadWhereContentChanged(
  before: readonly CanvasBlock[],
  after: readonly CanvasBlock[],
): CanvasBlock[] {
  const previous = new Map(before.map((block) => [block.id, block]));
  return after.map((block) => {
    const was = previous.get(block.id);
    // A block that did not exist before carries no stamp to invalidate.
    if (!was || block.readAt === undefined) return block;
    // 🔴 `note` COUNTS. An annotation is material added to the block that the learner has not read,
    // even though the paragraph itself is untouched — so the region owes reading again.
    if (was.content === block.content && was.note === block.note) return block;
    return { ...block, readAt: undefined };
  });
}

export function applyOps(canvas: LearningCanvas, ops: readonly CanvasOp[]): LearningCanvas {
  let blocks = canvas.blocks;
  let state = canvas.state;

  for (const op of ops) {
    switch (op.operation) {
      case "replace_block":
        blocks = blocks.map((block) =>
          block.id === op.blockId
            ? {
                ...block,
                content: op.content,
                // Provenance and concepts survive a rewrite unless the model restates them.
                // A simplified paragraph is still the same paragraph; dropping its citation
                // would break "where did this come from?" on exactly the blocks people edit.
                ...(op.sourceRefs?.length ? { sourceRefs: op.sourceRefs } : {}),
                ...(op.conceptIds?.length ? { conceptIds: op.conceptIds } : {}),
              }
            : block,
        );
        break;

      case "insert_before":
      case "insert_after": {
        const index = blocks.findIndex((block) => block.id === op.blockId);
        if (index < 0) break;
        const at = op.operation === "insert_after" ? index + 1 : index;
        blocks = [...blocks.slice(0, at), materialise(op.block), ...blocks.slice(at)];
        break;
      }

      case "delete_block":
        blocks = blocks.filter((block) => block.id !== op.blockId);
        break;

      case "collapse_block":
        blocks = blocks.map((block) => (block.id === op.blockId ? { ...block, collapsed: op.collapsed } : block));
        break;

      case "annotate_block":
        blocks = blocks.map((block) => (block.id === op.blockId ? { ...block, note: op.note } : block));
        break;

      case "rewrite_section": {
        const removing = new Set(op.blockIds);
        const at = blocks.findIndex((block) => removing.has(block.id));
        const kept = blocks.filter((block) => !removing.has(block.id));
        const fresh = op.blocks.map(materialise);
        const insertAt = at < 0 ? kept.length : Math.min(at, kept.length);
        blocks = [...kept.slice(0, insertAt), ...fresh, ...kept.slice(insertAt)];
        break;
      }

      case "replace_canvas":
        blocks = op.blocks.map(materialise);
        break;

      case "transition_state":
        state = op.to;
        break;
    }
  }

  if (blocks === canvas.blocks && state === canvas.state) return canvas;
  return {
    ...canvas,
    blocks: invalidateReadWhereContentChanged(canvas.blocks, blocks),
    state,
    updatedAt: new Date().toISOString(),
  };
}

// ── §11: rewrite in place, reversibly ────────────────────────────────────────────────────────
//
// 🔴 THESE ARE SEPARATE FROM `applyOps` ON PURPOSE. Every `replace_block` goes through `applyOps`,
// including the teaching loop's own rewrites. If recording the previous wording lived in there,
// blocks the learner never touched would grow a restore control offering to undo something they
// did not do — and worse, the teaching loop's ordinary rewriting would look to the learner like a
// change they could reverse. §11 is about the learner asking for a rewrite; only that path is
// reversible, so only that path records anything.
//
// Pure, so the "restore still resolves after a round trip" claim is a test rather than a promise.

/**
 * Apply a learner-requested rewrite, keeping the wording it replaced.
 *
 * 🔴 A REWRITE IS A READING REQUIREMENT (§39), SO `readAt` IS CLEARED. This was a real defect in
 * what §12 shipped, and it is silent: the learner presses Continue, marks the chunk finished, then
 * asks for a passage to be simplified — and gets NEW WORDING they have never read with no Continue
 * under it, because the block was still stamped as read. Asking for something simpler cost them
 * their pacing control. Measured before fixing: `unreadChunk` returned 0 on a freshly rewritten
 * block.
 *
 * The general form is worth more than the instance: `readAt` is a claim about CONTENT the learner
 * has seen, so any operation that replaces that content invalidates it. It is not a claim about
 * the block's identity.
 *
 * 🔴 `before` IS ONLY RECORDED THE FIRST TIME. Simplify a block twice and this keeps what it said
 * before the learner touched it at all — not the once-simplified middle version. See the note on
 * `CanvasBlock.previousContent` for why "the original" is the version worth keeping.
 */
export function applyRewrite(
  canvas: LearningCanvas,
  rewrite: { readonly ops: readonly CanvasOp[]; readonly blockId: string; readonly before: string },
): LearningCanvas {
  const applied = applyOps(canvas, rewrite.ops);
  return {
    ...applied,
    blocks: applied.blocks.map((block) => {
      if (block.id !== rewrite.blockId) return block;
      // Nothing actually changed: recording a "previous" version identical to the current one would
      // offer a restore that visibly does nothing, which reads as a broken control.
      if (block.content === rewrite.before) return block;
      // 🔴 NO `readAt` CLEARING HERE ANY MORE — `applyOps` above owns it, structurally, for every
      // operation rather than for this one. Doing it in both places would look like belt and
      // braces and actually hide a regression: if the structural rule broke, this would keep the
      // rewrite path working and only the paths nobody tests would strand a Continue.
      if (block.previousContent !== undefined) return block;
      return { ...block, previousContent: rewrite.before };
    }),
  };
}

/**
 * Put a rewritten block back the way it was, and stop offering to.
 *
 * 🔴 `previousContent` IS CLEARED, NOT LEFT BEHIND. A block holding a "previous" version identical
 * to what is now on screen would keep its restore control forever, and pressing it would do
 * nothing — the same broken-control failure `applyRewrite` guards against from the other side.
 *
 * A block with nothing to restore is returned unchanged rather than treated as an error: the
 * control should not exist in that state, and if it somehow does, doing nothing beats throwing.
 */
export function restoreBlock(canvas: LearningCanvas, blockId: string): LearningCanvas {
  return {
    ...canvas,
    blocks: canvas.blocks.map((block) => {
      if (block.id !== blockId || block.previousContent === undefined) return block;
      const { previousContent, ...rest } = block;
      return { ...rest, content: previousContent };
    }),
  };
}

/** Whether this block is offering to go back to how it was written (§11). */
export function isRewritten(block: { previousContent?: string }): boolean {
  return typeof block.previousContent === "string" && block.previousContent.length > 0;
}
