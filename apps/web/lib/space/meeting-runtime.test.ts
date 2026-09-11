import assert from "node:assert/strict";
import { test } from "node:test";

import { space } from "../../space/app/runtime.js";
import { createFakeSupabase, fakeMeetingDeps } from "./fake-backend";

type Rec = { status: string; by?: string; error?: string; job?: string; startedAt?: number; beat?: number };
type Block = { id: string; type: string; title: string[][]; children: string[]; parent: string; notes?: string[]; transcript?: Array<{ speaker: string; text: string }>; rec?: Rec };
type Runtime = {
  sb: unknown;
  me: { id: string };
  state: { pages: Record<string, Record<string, unknown>>; blocks: Record<string, Block>; sidebar: { private: string[] } };
  sync: { saved(): Promise<boolean> };
  meetingDeps: unknown;
  meetingPollMs: number;
  meetings: Map<string, unknown>;
  boot(): Promise<void>;
  resetState(): void;
  startMeeting(id: string): Promise<void>;
  stopMeeting(id: string): Promise<void>;
  discardMeeting(id: string): void;
  retryMeeting(id: string): Promise<void>;
  noticeMeetings(): void;
};
const runtime = space as unknown as Runtime;

async function until(ok: () => boolean, what: string) {
  const end = Date.now() + 3000;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A saved page holding one AI Meeting Notes block, as the slash menu makes it. */
async function meetingPage() {
  const fake = createFakeSupabase();
  runtime.resetState();
  runtime.sb = fake;
  await runtime.boot();
  const S = runtime.state;
  const [pid, tb, note] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  S.blocks[note] = { id: note, type: "text", title: [], children: [], parent: tb };
  S.blocks[tb] = { id: tb, type: "transcription", title: [], children: [], parent: pid, notes: [note], transcript: [] };
  S.pages[pid] = { id: pid, kind: "page", icon: null, title: "Meeting ", content: [tb], lastEdited: 1, parent: null, section: "private" };
  S.sidebar.private.unshift(pid);
  assert.equal(await runtime.sync.saved(), true, "the meeting page reached the server");
  runtime.meetingPollMs = 20;
  return { fake, pid, tb };
}

test("🔴 a recorded meeting is filed from its block and page, and the worker's notes land in the block as its summary and transcript", async () => {
  const { fake, pid, tb } = await meetingPage();
  const deps = fakeMeetingDeps(fake, 60);
  const filed: Array<{ blockId: string; pageId: string }> = [];
  runtime.meetingDeps = {
    ...deps,
    fileMeetingRecording: (input: Parameters<typeof deps.fileMeetingRecording>[0]) => {
      filed.push({ blockId: input.blockId, pageId: input.pageId });
      return deps.fileMeetingRecording(input);
    },
  };

  await runtime.startMeeting(tb);
  const b = runtime.state.blocks[tb]!;
  assert.equal(b.rec?.status, "recording");
  assert.equal(b.rec?.by, runtime.me.id);
  await runtime.stopMeeting(tb);
  assert.deepEqual(filed, [{ blockId: tb, pageId: pid }]);
  assert.equal(runtime.meetings.size, 0, "the microphone is closed");

  await until(() => b.rec?.status === "ready", "the written-up notes");
  const summary = b.children.map((id) => runtime.state.blocks[id]!);
  assert.ok(summary.some((x) => /header/.test(x.type)), "the notes' headings are blocks");
  assert.ok(summary.every((x) => x.parent === tb), "the summary sits inside the meeting block");
  assert.deepEqual(b.transcript!.map((line) => line.text), ["We went through the plan for the week.", "The draft goes out on Friday."]);
  assert.equal(b.title[0]![0], "Project check-in", "an unnamed meeting takes the worker's title");

  assert.equal(await runtime.sync.saved(), true);
  const server = (fake as unknown as { server: { recs: Map<string, { props: Record<string, unknown> }> } }).server;
  assert.ok(server.recs.get(b.children[0]!), "the summary reached the server, so everyone on the page sees it");
  assert.equal((server.recs.get(tb)!.props.rec as Rec).status, "ready");
});

test("a failed write-up shows the worker's reason, and Try again restarts it", async () => {
  const { fake, tb } = await meetingPage();
  runtime.meetingDeps = fakeMeetingDeps(fake, 60_000);
  await runtime.startMeeting(tb);
  await runtime.stopMeeting(tb);
  const b = runtime.state.blocks[tb]!;
  const job = fake.tables.get("recording_jobs")![0]!;
  Object.assign(job, { status: "failed", error: "The transcript came back empty." });
  await until(() => b.rec?.status === "failed", "the failure");
  assert.equal(b.rec?.error, "The transcript came back empty.");

  await runtime.retryMeeting(tb);
  assert.equal(b.rec?.status, "processing");
  assert.equal(job.status, "processing", "the job is reset from the stage that failed");
  runtime.resetState();
});

test("a take with no sound is not filed, Discard keeps nothing, and a recording lost to a reload says so", async () => {
  const { fake, tb } = await meetingPage();
  let filed = 0;
  let discarded = 0;
  runtime.meetingDeps = {
    startMeetingRecorder: async () => ({
      elapsed: () => 9,
      stop: async () => ({ blob: new Blob([]), seconds: 0, wallSeconds: 9, silenceSkipped: null }),
      discard: () => {
        discarded++;
      },
    }),
    fileMeetingRecording: async () => {
      filed++;
      return { jobId: "never", artifactId: "never" };
    },
  };
  const b = runtime.state.blocks[tb]!;
  await runtime.startMeeting(tb);
  await runtime.stopMeeting(tb);
  assert.equal(filed, 0);
  assert.match(String(b.rec?.error), /did not hear anything/);

  delete b.rec;
  await runtime.startMeeting(tb);
  runtime.discardMeeting(tb);
  assert.equal(discarded, 1);
  assert.equal(b.rec, undefined);

  b.rec = { status: "recording", by: runtime.me.id, startedAt: Date.now() - 600_000, beat: Date.now() - 600_000 };
  runtime.noticeMeetings();
  assert.equal(b.rec?.status, "failed");
  assert.match(String(b.rec?.error), /stopped before it was saved/);
  assert.equal(fake.tables.get("recording_jobs")!.length, 0);
});
