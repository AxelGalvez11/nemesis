import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { supabase } from "@/lib/supabase";

import { appendMessageCloud, renameThreadCloud, uploadLocalSessionsToCloud, upsertThreadCloud } from "./sessions-cloud";
import type { SessionMessage, WorkspaceSession } from "./sessions-store";

// ── supabase.from() stub — no network/database. Records every call so tests
// can assert on the EXACT upsert options used, which is what the bug this
// file guards against actually looked like: a call that "worked" in the
// sense of not throwing at the call site, but silently used the wrong
// options and failed server-side (see sessions-cloud.ts's appendMessageCloud
// doc comment). Only the methods sessions-cloud.ts actually calls are
// implemented. ────────────────────────────────────────────────────────────

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function installSupabaseStub(): { calls: RecordedCall[]; restore: () => void } {
  const calls: RecordedCall[] = [];
  const client = supabase as unknown as { from: (table: string) => unknown };
  const originalFrom = client.from;
  client.from = ((table: string) => {
    const record = (method: string, args: unknown[]) => calls.push({ args, method, table });
    return {
      delete: () => {
        record("delete", []);
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
      select: (...selectArgs: unknown[]) => {
        record("select", selectArgs);
        return { eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      },
      update: (patch: unknown) => {
        record("update", [patch]);
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
      upsert: (row: unknown, opts?: unknown) => {
        record("upsert", [row, opts]);
        return Promise.resolve({ error: null });
      },
    };
  }) as typeof client.from;
  return {
    calls,
    restore: () => {
      client.from = originalFrom;
    },
  };
}

const session = (overrides: Partial<WorkspaceSession> = {}): WorkspaceSession => ({
  createdAt: "2026-07-20T00:00:00.000Z",
  id: "s1",
  messages: [],
  title: "A session",
  updatedAt: "2026-07-20T00:00:00.000Z",
  ...overrides,
});

const message = (overrides: Partial<SessionMessage> = {}): SessionMessage => ({
  at: "2026-07-20T00:00:00.000Z",
  content: "hi",
  id: "m1",
  role: "user",
  ...overrides,
});

describe("appendMessageCloud", () => {
  it("upserts chat_messages with ignoreDuplicates: true — chat_messages has NO update grant (see migration 20260720210000), so the default DO-UPDATE upsert fails permission-checks on every call, silently, via cloudFireAndForget", async () => {
    const stub = installSupabaseStub();
    try {
      await appendMessageCloud("u1", session(), message());
      const threadUpsert = stub.calls.find((c) => c.table === "chat_threads" && c.method === "upsert");
      const messageUpsert = stub.calls.find((c) => c.table === "chat_messages" && c.method === "upsert");
      assert.ok(threadUpsert, "the thread row must be upserted first (message.thread_id is an FK to it)");
      assert.ok(messageUpsert, "the message row must be upserted");
      assert.deepEqual(messageUpsert!.args[1], { ignoreDuplicates: true, onConflict: "id" });
    } finally {
      stub.restore();
    }
  });

  it("clamps content to 60,000 chars (chat_messages.content check constraint) instead of letting an oversized write fail silently", async () => {
    const stub = installSupabaseStub();
    try {
      await appendMessageCloud("u1", session(), message({ content: "a".repeat(70_000) }));
      const row = stub.calls.find((c) => c.table === "chat_messages" && c.method === "upsert")!.args[0] as { content: string };
      assert.equal(row.content.length, 60_000);
    } finally {
      stub.restore();
    }
  });

  it("is a no-op when the message has no id (defensive — the store always assigns one first)", async () => {
    const stub = installSupabaseStub();
    try {
      const { id: _omit, ...withoutId } = message();
      await appendMessageCloud("u1", session(), withoutId as SessionMessage);
      assert.equal(stub.calls.length, 0);
    } finally {
      stub.restore();
    }
  });
});

describe("uploadLocalSessionsToCloud (one-time local→cloud migration)", () => {
  it("also upserts chat_messages with ignoreDuplicates: true — same no-update-grant reasoning as appendMessageCloud", async () => {
    const stub = installSupabaseStub();
    try {
      await uploadLocalSessionsToCloud("u1", [session({ messages: [message()] })]);
      const messageUpsert = stub.calls.find((c) => c.table === "chat_messages" && c.method === "upsert")!;
      assert.deepEqual(messageUpsert.args[1], { ignoreDuplicates: true, onConflict: "id" });
    } finally {
      stub.restore();
    }
  });
});

describe("upsertThreadCloud / renameThreadCloud", () => {
  it("clamps the thread title to 200 chars on upsert (chat_threads.title check constraint)", async () => {
    const stub = installSupabaseStub();
    try {
      await upsertThreadCloud("u1", session({ title: "x".repeat(500) }));
      const row = stub.calls.find((c) => c.table === "chat_threads" && c.method === "upsert")!.args[0] as { title: string };
      assert.equal(row.title.length, 200);
    } finally {
      stub.restore();
    }
  });

  it("clamps the title on rename too", async () => {
    const stub = installSupabaseStub();
    try {
      await renameThreadCloud("u1", "s1", "y".repeat(500), "2026-07-20T00:00:00.000Z");
      const patch = stub.calls.find((c) => c.table === "chat_threads" && c.method === "update")!.args[0] as { title: string };
      assert.equal(patch.title.length, 200);
    } finally {
      stub.restore();
    }
  });

  it("does NOT set ignoreDuplicates on the chat_threads upsert — rename/pin bumps rely on the row actually updating on conflict, and chat_threads DOES have an update grant", async () => {
    const stub = installSupabaseStub();
    try {
      await upsertThreadCloud("u1", session());
      const opts = stub.calls.find((c) => c.table === "chat_threads" && c.method === "upsert")!.args[1] as Record<string, unknown>;
      assert.equal(opts.ignoreDuplicates, undefined);
      assert.equal(opts.onConflict, "id");
    } finally {
      stub.restore();
    }
  });
});
