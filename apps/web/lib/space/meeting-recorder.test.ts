import assert from "node:assert/strict";
import { test } from "node:test";

import { fileMeetingRecording, type MeetingTake } from "./meeting-recorder";

const take = (bytes = 1024): MeetingTake => ({ blob: new Blob([new Uint8Array(bytes)], { type: "audio/webm;codecs=opus" }), seconds: 42, wallSeconds: 60, silenceSkipped: null });

function bucket(error: unknown = null) {
  const uploads: Array<{ bucket: string; path: string; contentType: string }> = [];
  return {
    uploads,
    storage: {
      from: (name: string) => ({
        upload: async (path: string, _file: Blob, options: { contentType: string; upsert: boolean }) => {
          uploads.push({ bucket: name, path, contentType: options.contentType });
          return { error };
        },
      }),
    },
  };
}

test("🔴 a meeting recording is uploaded under the person's own folder and filed as a workspace recording for its block and page", async () => {
  const { storage, uploads } = bucket();
  const sent: Array<{ url: string; auth: string | null; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, auth: new Headers(init.headers).get("Authorization"), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ jobId: "job-1", artifactId: "art-1", title: "Recording" }), { status: 200 });
  }) as unknown as typeof fetch;

  const job = await fileMeetingRecording({ storage, token: "tok", userId: "user-1", take: take(), blockId: "block-1", pageId: "page-1", fetchImpl });
  assert.deepEqual(job, { jobId: "job-1", artifactId: "art-1" });
  assert.equal(uploads[0]!.bucket, "recordings");
  assert.match(uploads[0]!.path, /^user-1\//, "the bucket only accepts paths under the uploader's own id");
  assert.equal(uploads[0]!.contentType, "audio/webm", "the codec is stripped before upload");
  assert.equal(sent[0]!.url, "/api/recordings/jobs");
  assert.equal(sent[0]!.auth, "Bearer tok");
  assert.deepEqual(
    { surface: sent[0]!.body.surface, contextId: sent[0]!.body.contextId, messageId: sent[0]!.body.messageId, durationSeconds: sent[0]!.body.durationSeconds, storagePath: sent[0]!.body.storagePath },
    { surface: "space", contextId: "block-1", messageId: "page-1", durationSeconds: 42, storagePath: uploads[0]!.path },
  );
});

test("the route's own reason comes back when a recording cannot be filed, and nothing is filed without a session", async () => {
  const { storage } = bucket();
  const refused = (async () => new Response(JSON.stringify({ error: "You have reached this month's transcription limit." }), { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(fileMeetingRecording({ storage, token: "tok", userId: "u", take: take(), blockId: "b", pageId: "p", fetchImpl: refused }), /this month's transcription limit/);
  await assert.rejects(fileMeetingRecording({ storage, token: null, userId: "u", take: take(), blockId: "b", pageId: "p", fetchImpl: refused }), /Sign in/);
  const failing = bucket({ message: "network" });
  await assert.rejects(fileMeetingRecording({ storage: failing.storage, token: "tok", userId: "u", take: take(), blockId: "b", pageId: "p", fetchImpl: refused }), /could not be uploaded/);
});
