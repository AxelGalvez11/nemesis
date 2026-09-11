import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase, fakeSourceReader } from "./fake-backend";

/**
 * 🔴 A WORKSPACE IS WHAT ITS SOURCES SAY (docs/space/PLAN.md, M13). Owner, 2026-09-11: a workspace keeps the sources,
 * the chats and the notes in one place, and a workspace shared with classmates shares its sources while each person's
 * chats stay their own.
 *
 * The reading itself is the app's own upload lane, stood in for here. What these tests hold is the part that is ours:
 * a file that was read is offered to the workspace's chats, a file that could not be read is not, and a question asked
 * in a workspace carries them.
 */
type Source = { id: string; name: string; chars: number; status: string; error: string | null };
type Fake = { sources: Source[]; tables: Map<string, Array<Record<string, unknown>>> };
type Chat = { id: string; running?: boolean; workspace?: string | null };
type ForTurn = { id: string; name: string; content: string; type: string; grounded?: unknown };
type TurnInput = { message: string; sources?: ForTurn[]; onContent?: (visible: string) => void };
type Runtime = {
  sb: unknown;
  sourceReader: unknown;
  chatEngine: unknown;
  state: { aiChats: Record<string, Chat> };
  boot(): Promise<void>;
  resetState(): void;
  addSourceFile(page: string, file: File): Promise<unknown>;
  loadSources(page: string, force?: boolean): Promise<void>;
  sourcesOf(page: string): { items: Source[]; loaded: boolean };
  sourcesForTurn(page: string): Promise<ForTurn[]>;
  removeSource(page: string, id: string): Promise<void>;
  sendChat(id: string | null, text: string, opts?: { workspace?: string | null }): string | null;
};
const runtime = space as unknown as Runtime;
const PAGE = "11111111-2222-3333-4444-555555555555";

async function fresh() {
  const fake = createFakeSupabase() as unknown as Fake;
  runtime.resetState();
  runtime.sb = fake;
  runtime.sourceReader = fakeSourceReader;
  await runtime.boot();
  return fake;
}

async function until(ok: () => boolean, what: string) {
  const end = Date.now() + 3000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("🔴 a file added to a workspace is read, kept with the workspace, and offered to its chats", async () => {
  const fake = await fresh();
  await runtime.addSourceFile(PAGE, new File(["Entropy counts the ways a state can be arranged."], "Lecture 7.txt", { type: "text/plain" }));

  const kept = fake.sources;
  assert.equal(kept.length, 1, "the source was not saved with the workspace");
  assert.equal(kept[0]!.status, "ready");
  assert.ok(kept[0]!.chars > 0, "the source was saved with no text, so no chat could read it");

  await runtime.loadSources(PAGE, true);
  const listed = runtime.sourcesOf(PAGE).items;
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.name, "Lecture 7.txt");

  const forTurn = await runtime.sourcesForTurn(PAGE);
  assert.equal(forTurn.length, 1, "the workspace's chats were offered nothing to read");
  assert.match(forTurn[0]!.content, /Lecture 7\.txt/, "the source reached the turn without its text");
  assert.equal(forTurn[0]!.type, "document");
  // Grounded on arrival: the turn retrieves what the question needs and the answer can cite the source by name.
  const grounded = forTurn[0]!.grounded as { title: string; excerpts: unknown[] } | undefined;
  assert.ok(grounded, "the source arrived without grounding, so the answer could not cite it");
  assert.equal(grounded.title, "Lecture 7.txt");
  assert.ok(grounded.excerpts.length > 0, "the source arrived with no excerpts, so retrieval has nothing to match");
});

test("🔴 a file nothing could be read out of says so, and is never handed to a question", async () => {
  const fake = await fresh();
  await runtime.addSourceFile(PAGE, new File([""], "unreadable scan.pdf", { type: "application/pdf" }));

  assert.equal(fake.sources.length, 1, "a file that could not be read vanished instead of saying so");
  assert.equal(fake.sources[0]!.status, "failed");
  assert.ok(fake.sources[0]!.error, "the failure has no reason on it, so the learner cannot know what happened");

  const forTurn = await runtime.sourcesForTurn(PAGE);
  assert.equal(forTurn.length, 0, "a source with no text was handed to a question anyway");
});

test("🔴 a question asked inside a workspace carries that workspace's sources", async () => {
  await fresh();
  await runtime.addSourceFile(PAGE, new File(["x"], "Lecture 7.txt", { type: "text/plain" }));

  let seen: TurnInput | null = null;
  runtime.chatEngine = async (input: TurnInput) => {
    seen = input;
    input.onContent?.("Answered.");
    return { content: "Answered.", citations: [], suggestions: { followUps: [], branches: [], newThreads: [] }, title: "Entropy", truncated: false, error: null };
  };

  const id = runtime.sendChat(null, "What does my lecture say about entropy?", { workspace: PAGE });
  await until(() => !runtime.state.aiChats[id!]!.running, "the answer to land");
  assert.ok(seen, "the turn never ran");
  assert.equal((seen as TurnInput).sources?.length, 1, "the workspace's chat read nothing");

  // And a chat outside a workspace carries none, so a general question is not answered from someone's coursework.
  seen = null;
  const plain = runtime.sendChat(null, "Help me plan revision", {});
  await until(() => !runtime.state.aiChats[plain!]!.running, "the second answer to land");
  assert.equal((seen as unknown as TurnInput).sources?.length ?? 0, 0);
});

test("removing a source takes it out of the workspace and out of what its chats read", async () => {
  const fake = await fresh();
  await runtime.addSourceFile(PAGE, new File(["x"], "Lecture 7.txt", { type: "text/plain" }));
  const id = fake.sources[0]!.id;

  await runtime.removeSource(PAGE, id);
  assert.equal(fake.sources.length, 0, "the source is still saved with the workspace");
  assert.equal(runtime.sourcesOf(PAGE).items.length, 0);
  assert.equal((await runtime.sourcesForTurn(PAGE)).length, 0);
});
