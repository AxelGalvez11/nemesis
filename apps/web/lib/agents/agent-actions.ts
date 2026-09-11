// ── What a connected AI can do in Nemesis ───────────────────────────────────────────────────────────────────────────
//
// The tools behind /api/mcp (docs/space/PLAN.md, M11). Each one runs with a Supabase client that carries the person's own
// token, so row security decides what it reaches, exactly as it does for them in the app. Following cards-are-output-only,
// the AI writes the cards and the tests; the person studies, rates and asks for changes in Nemesis.

import type { SupabaseClient } from "@supabase/supabase-js";

import { noteToPage } from "@/lib/space/library-import";
import { normalizeState } from "@/lib/space/records";
import { orderCreates } from "@/lib/space/sync-engine";
import { parseTestContent } from "@/lib/workspace/study-artifact-content";

/** The tag on every card an AI tool adds, so Study can say where a card came from. */
export const AGENT_CARD_TAG = "made-by-ai";
const MAX_CARDS = 200;
const MAX_TEXT = 2_000;
const MAX_PAGE_CHARS = 100_000;
/** ws_apply refuses a write of more than this. */
const MAX_OPS = 2_000;

export type AgentDb = Pick<SupabaseClient, "from" | "rpc">;

/** A refusal written for the AI to relay: what went wrong and what to do instead. */
export class AgentActionError extends Error {}

type Row = Record<string, unknown>;

const clean = (value: unknown, max = MAX_TEXT) => (typeof value === "string" ? value.trim().replace(/\s+\n/g, "\n").slice(0, max) : "");

async function workspace(db: AgentDb): Promise<Row & { space: { id: string } }> {
  const { data, error } = await db.rpc("ws_bootstrap", { p_space: null });
  const boot = data as (Row & { space?: { id?: unknown } }) | null;
  if (error || !boot || typeof boot.space?.id !== "string") throw new AgentActionError("The workspace could not be opened just now. Try again in a moment.");
  return boot as Row & { space: { id: string } };
}

const titleOf = (record: Row): string => {
  const props = (record.props ?? {}) as Row;
  const title = props.title ?? record.title;
  return typeof title === "string" && title.trim() ? title.trim() : "Untitled";
};

/** The pages the person opened lately and the ones at the top of their sidebar, newest first, each once. */
export async function listPages(db: AgentDb): Promise<Array<{ id: string; title: string }>> {
  const boot = await workspace(db);
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string }> = [];
  for (const list of [boot.recents, boot.roots, boot.shared]) {
    for (const record of Array.isArray(list) ? (list as Row[]) : []) {
      if (typeof record.id !== "string" || seen.has(record.id)) continue;
      seen.add(record.id);
      out.push({ id: record.id, title: titleOf(record) });
    }
  }
  return out.slice(0, 100);
}

const BLOCK_PREFIX: Record<string, string> = { header: "# ", sub_header: "## ", sub_sub_header: "### ", header_4: "#### ", bulleted_list: "- ", numbered_list: "1. ", quote: "> " };

/** A page as plain text in reading order, headings and lists marked the Markdown way. */
export async function readPage(db: AgentDb, pageId: string): Promise<{ id: string; title: string; text: string }> {
  const { data, error } = await db.rpc("ws_load_page", { p_page: pageId });
  const loaded = data as { error?: unknown; page?: Row; records?: Row[] } | null;
  if (error || !loaded || loaded.error || !loaded.page) throw new AgentActionError("That page could not be opened. Use list_pages to find a page this person can read.");
  const byId = new Map((loaded.records ?? []).filter((r) => typeof r.id === "string").map((r) => [r.id as string, r]));
  const lines: string[] = [];
  const textOf = (props: Row) => (Array.isArray(props.title) ? (props.title as unknown[]).map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : "")).join("") : "");
  const walk = (ids: unknown, depth: number) => {
    if (!Array.isArray(ids) || depth > 12) return;
    for (const id of ids) {
      const block = typeof id === "string" ? byId.get(id) : undefined;
      if (!block || block.kind !== "block") continue;
      const props = (block.props ?? {}) as Row;
      const type = String(block.type ?? "text");
      const text = textOf(props).trim();
      const prefix = type === "to_do" ? (props.checked ? "- [x] " : "- [ ] ") : (BLOCK_PREFIX[type] ?? "");
      if (text) lines.push(`${"  ".repeat(depth)}${prefix}${text}`);
      walk(props.children, depth + 1);
    }
  };
  walk(((loaded.page.props ?? {}) as Row).content, 0);
  return { id: pageId, title: titleOf(loaded.page), text: lines.join("\n").slice(0, 60_000) };
}

/** A new page in the person's Private section, from Markdown, saved in one write like any page made in the app. */
export async function createPage(db: AgentDb, input: { title: string; markdown: string }): Promise<{ id: string; title: string }> {
  const title = clean(input.title, 200) || "Untitled";
  const markdown = typeof input.markdown === "string" ? input.markdown.slice(0, MAX_PAGE_CHARS) : "";
  const boot = await workspace(db);
  const { page, blocks } = noteToPage({ id: "agent", title, content: markdown }, null, () => crypto.randomUUID(), Date.now());
  const pageRow: Row = { ...page };
  delete pageRow.importedFrom;
  const records = normalizeState({
    pages: { [page.id]: pageRow },
    blocks: Object.fromEntries(blocks.map((block) => [block.id, block])),
    collections: {},
    views: {},
    rows: {},
  } as unknown as Parameters<typeof normalizeState>[0]);
  const ops = orderCreates([...records.values()]).map((rec) => ({
    op: "create",
    id: rec.id,
    kind: rec.kind,
    type: rec.type,
    parent_id: rec.parent_id,
    props: rec.props,
    ...(rec.kind === "page" && rec.parent_id === null ? { section: "private" } : {}),
  }));
  if (ops.length > MAX_OPS) throw new AgentActionError("That page is too long to create in one go. Split it into shorter pages.");
  const { data, error } = await db.rpc("ws_apply", { p_space: boot.space.id, p_ops: ops, p_client: "agent" });
  const denied = (data as { denied?: unknown } | null)?.denied;
  if (error || (Array.isArray(denied) && denied.length)) throw new AgentActionError("The page could not be saved in the workspace.");
  return { id: page.id, title };
}

/** The person's flashcard decks, by name. */
export async function listDecks(db: AgentDb): Promise<string[]> {
  const { data, error } = await db.from("study_decks").select("id,name").order("name").limit(1000);
  if (error) throw new AgentActionError("The decks could not be read just now. Try again in a moment.");
  return ((data ?? []) as Row[]).map((row) => String(row.name ?? "")).filter(Boolean);
}

/** Cards written by the AI, into the deck with that name (made when there is none), as the person's own cards. */
export async function addFlashcards(
  db: AgentDb,
  userId: string,
  input: { deck: string; cards: ReadonlyArray<{ front: string; back: string }> },
): Promise<{ deck: string; created_deck: boolean; added: number }> {
  const name = clean(input.deck, 200);
  if (!name) throw new AgentActionError("Name the deck the cards go in.");
  const cards = input.cards.map((card) => ({ front: clean(card.front), back: clean(card.back) })).filter((card) => card.front && card.back);
  if (!cards.length) throw new AgentActionError("Every card needs a front and a back.");
  if (cards.length > MAX_CARDS) throw new AgentActionError(`Add at most ${MAX_CARDS} cards at a time.`);

  const { data: decks, error: readError } = await db.from("study_decks").select("id,name").limit(1000);
  if (readError) throw new AgentActionError("The decks could not be read just now. Try again in a moment.");
  const existing = ((decks ?? []) as Row[]).find((deck) => String(deck.name ?? "").toLowerCase() === name.toLowerCase());
  let deckId = typeof existing?.id === "string" ? existing.id : null;
  if (!deckId) {
    const { data, error } = await db.from("study_decks").insert({ user_id: userId, name, description: "Made by an AI tool connected to Nemesis." }).select("id").single();
    if (error || typeof (data as Row | null)?.id !== "string") throw new AgentActionError("The deck could not be created.");
    deckId = (data as { id: string }).id;
  }
  for (let i = 0; i < cards.length; i += 100) {
    const rows = cards.slice(i, i + 100).map((card) => ({ user_id: userId, deck_id: deckId, front: card.front, back: card.back, card_type: "basic", tags: [AGENT_CARD_TAG] }));
    const { error } = await db.from("study_cards").insert(rows);
    if (error) throw new AgentActionError(i ? `Only ${i} of ${cards.length} cards were saved before an error.` : "The cards could not be saved.");
  }
  return { deck: existing ? String(existing.name) : name, created_deck: !existing, added: cards.length };
}

export interface AgentQuestion {
  question: string;
  /** Multiple choice: 2 to 6 options, with `answer` the 0-based index of the right one. Leave out for a typed question. */
  options?: string[];
  answer: number | string;
  explanation?: string;
  /** Typed questions: other spellings or phrasings that also count. */
  also_accept?: string[];
}

/** A practice test the person takes in Study. Questions Study cannot use are dropped, and the count says so. */
export async function addPracticeTest(
  db: AgentDb,
  userId: string,
  input: { title: string; questions: readonly AgentQuestion[] },
): Promise<{ title: string; questions: number; dropped: number }> {
  const title = clean(input.title, 200);
  if (!title) throw new AgentActionError("Give the test a title.");
  const items = input.questions.map((question) =>
    Array.isArray(question.options) && question.options.length
      ? { q: question.question, options: question.options, answer: question.answer, why: question.explanation ?? "" }
      : { q: question.question, typedAnswer: String(question.answer ?? ""), accept: question.also_accept ?? [], strict: false, why: question.explanation ?? "" },
  );
  const content = parseTestContent({ questions: items, attempts: [] });
  if (!content || !content.questions.length) {
    throw new AgentActionError("None of the questions could be used. A choice question needs 2 to 6 options and the index of the right one; a typed question needs its answer written out.");
  }
  const { data, error } = await db.from("study_artifacts").insert({ user_id: userId, kind: "test", title, content, status: "ready" }).select("id").single();
  if (error || typeof (data as Row | null)?.id !== "string") throw new AgentActionError("The test could not be saved.");
  return { title, questions: content.questions.length, dropped: input.questions.length - content.questions.length };
}
