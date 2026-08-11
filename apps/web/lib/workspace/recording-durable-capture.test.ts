import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { createDurableCapture, storedManifests } from "./recording-durable-capture";
import { assemblyOrder, playability } from "./recording-manifest";

// A localStorage good enough for the manifest record. The real one is a browser API; this only
// has to remember strings.
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, value),
    },
  };
}

interface FakeStorage {
  written: Map<string, string>;
  failOnce: (path: string) => void;
  upload: (path: string, blob: Blob) => Promise<void>;
}

function fakeStorage(): FakeStorage {
  const written = new Map<string, string>();
  const failures = new Set<string>();
  return {
    failOnce: (path) => void failures.add(path),
    async upload(path, blob) {
      // Awaited before the decision so a failure lands on a later microtask, the way a real
      // network failure does — a synchronous throw would not exercise the race at all.
      const text = await blob.text();
      if (failures.delete(path)) throw new Error("network");
      written.set(path, text);
    },
    written,
  };
}

function capture(storage: FakeStorage) {
  return createDurableCapture({
    chunkMs: 1_000,
    extension: "webm",
    mimeType: "audio/webm",
    partSeconds: 2, // two chunks per part, so the test can drive flushes precisely
    sessionId: "r1",
    targetPath: "u1/r1.webm",
    upload: storage.upload,
    userId: "u1",
  });
}

const chunk = (text: string) => new Blob([text], { type: "audio/webm" });

beforeEach(installStorage);

test("🔴 bytes keep the position they were captured at, even when an upload fails", async () => {
  // THE DEFECT THIS TEST WAS WRITTEN FOR.
  //
  // The first version claimed a part index from a counter, and on failure put the bytes back
  // into the shared buffer and tried to hand the index back. That only worked when no later
  // flush had already claimed one — which is false in exactly the case that matters, because a
  // slow upload is what lets the next flush happen first. The orphaned bytes were then uploaded
  // at a LATER index, so the opening of the lecture landed in the middle of the file.
  //
  // Assembly by index is only correct if an index means the same bytes forever.
  const storage = fakeStorage();
  const durable = capture(storage);
  storage.failOnce("u1/recordings/r1/parts/00000.webm");

  // Both parts are claimed before either upload runs — the race, driven deterministically.
  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  durable.onChunk(chunk("c"));
  durable.onChunk(chunk("d"));
  durable.onChunk(chunk("e"));
  durable.onChunk(chunk("f"));

  const manifest = await durable.finish();
  const joined = assemblyOrder(manifest)
    .map((path) => storage.written.get(path) ?? "")
    .join("");
  assert.equal(joined, "abcdef", "the recording reassembles in capture order");
  assert.deepEqual(
    manifest.parts.map((part) => part.index),
    [0, 1, 2],
    "and every position is present",
  );
});

test("🔴 a part that keeps failing stays at its own index rather than moving down the file", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  // Fail part 1 once. Parts 0 and 2 land immediately; 1 must land in its own slot on retry.
  storage.failOnce("u1/recordings/r1/parts/00001.webm");

  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  durable.onChunk(chunk("c"));
  durable.onChunk(chunk("d"));
  durable.onChunk(chunk("e"));
  durable.onChunk(chunk("f"));

  const manifest = await durable.finish();
  assert.equal(storage.written.get("u1/recordings/r1/parts/00001.webm"), "cd", "the retry went back to slot 1");
  assert.equal(
    assemblyOrder(manifest).map((path) => storage.written.get(path)).join(""),
    "abcdef",
  );
});

test("🔴 an upload failure never stops the recording", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  storage.failOnce("u1/recordings/r1/parts/00000.webm");
  storage.failOnce("u1/recordings/r1/parts/00001.webm");

  // The microphone is the irreplaceable part. Handing over chunks must not throw whatever the
  // network is doing.
  assert.doesNotThrow(() => {
    for (const text of ["a", "b", "c", "d"]) durable.onChunk(chunk(text));
  });
  const manifest = await durable.finish();
  assert.equal(playability(manifest), "complete", "and the retries still landed everything");
});

test("what could not be uploaded is reported, not quietly dropped", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  // A network that never comes back: every attempt for part 0 fails.
  const alwaysFails: FakeStorage["upload"] = async (path, blob) => {
    await blob.text();
    if (path.endsWith("00000.webm")) throw new Error("offline");
    await storage.upload(path, blob);
  };
  const offline = createDurableCapture({
    chunkMs: 1_000,
    extension: "webm",
    mimeType: "audio/webm",
    partSeconds: 2,
    sessionId: "r1",
    targetPath: "u1/r1.webm",
    upload: alwaysFails,
    userId: "u1",
  });
  for (const text of ["a", "b", "c", "d"]) offline.onChunk(chunk(text));
  const manifest = await offline.finish();

  // 🔴 Part 0 carries the container header. A set without it is bytes, not audio, and offering
  // it back would report success and deliver silence.
  assert.equal(playability(manifest), "unplayable");
  assert.equal(manifest.state, "incomplete", "and finish says so rather than claiming success");
});

test("the manifest that survives the tab is the one on disk, not the one in memory", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  await durable.settled();

  const stored = storedManifests();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.parts.length, 1, "a part is recorded the moment it lands, not at finish");
  assert.equal(stored[0]!.state, "recording", "a crash here is recoverable");
});

test("discarding forgets the recording so it is never offered back", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  await durable.settled();
  assert.equal(storedManifests().length, 1);

  durable.discard();
  assert.deepEqual(storedManifests(), [], "a cancel that leaves a recoverable recording is not a cancel");
});

// ── durability state (§3) ────────────────────────────────────────────────────
// "The microphone is still running" and "your audio is safe" are DIFFERENT CLAIMS, and the
// first version of this file conflated them: it swallowed every upload failure and exposed
// nothing, so the UI kept implying durability while nothing was being stored.

test("🔴 durability says where the bytes are, and never calls memory-only capture safe", async () => {
  const storage = fakeStorage();
  // A connection that is simply gone, which is the case the state exists to name.
  let offline = true;
  const durable = createDurableCapture({
    chunkMs: 1_000, extension: "webm", mimeType: "audio/webm", partSeconds: 2,
    sessionId: "r1", targetPath: "u1/r1.webm", userId: "u1",
    upload: async (path, blob) => {
      if (offline) { await blob.text(); throw new Error("offline"); }
      await storage.upload(path, blob);
    },
  });
  assert.equal(durable.durability(), "remote", "nothing captured yet is trivially safe");

  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  await durable.settled();
  assert.equal(durable.durability(), "local", "one failure is a blip, and it is still queued");

  durable.onChunk(chunk("c"));
  durable.onChunk(chunk("d"));
  await durable.settled();
  assert.equal(durable.durability(), "degraded", "a part that failed twice means the network is gone");

  // And it clears itself when the connection comes back — no timer, no manual reset.
  offline = false;
  durable.onChunk(chunk("e"));
  durable.onChunk(chunk("f"));
  await durable.settled();
  assert.equal(durable.durability(), "remote", "everything landed, so it is safe again");
});

test("🔴 one part stuck while the rest land is degraded, not healthy", async () => {
  // THE CASE THAT SEPARATES THIS RULE FROM THE ONE IT REPLACED. The first version counted
  // CONSECUTIVE failures globally, and any success reset it — so a single part that can never
  // upload, surrounded by parts that upload fine, never reached the threshold. The queue holds a
  // permanent hole and the state reads healthy.
  //
  // It also matters more than it sounds: the part most likely to be stuck is one whose bytes are
  // already in the manifest's gap list, and if that is part 0 the whole recording is unplayable.
  const storage = fakeStorage();
  const durable = createDurableCapture({
    chunkMs: 1_000, extension: "webm", mimeType: "audio/webm", partSeconds: 2,
    sessionId: "r1", targetPath: "u1/r1.webm", userId: "u1",
    upload: async (path, blob) => {
      await blob.text();
      if (path.endsWith("00000.webm")) throw new Error("this one never lands");
      await storage.upload(path, blob);
    },
  });
  for (const text of ["a", "b", "c", "d", "e", "f"]) durable.onChunk(chunk(text));
  await durable.settled();
  await durable.settled();
  assert.equal(durable.durability(), "degraded", "a part that cannot upload is not a healthy recording");
});

test("a recording whose parts are all stored reports remote", async () => {
  const storage = fakeStorage();
  const durable = capture(storage);
  durable.onChunk(chunk("a"));
  durable.onChunk(chunk("b"));
  await durable.settled();
  assert.equal(durable.durability(), "remote");
});

test("🔴 a capture cannot be created without an owner to store it for", () => {
  // Loud at construction rather than inside the retry loop: `drain()`'s catch is "leave it
  // pending and try again", so a throw in there would be an invisible forever-retry — the same
  // silent-degradation shape this file was rewritten to remove.
  assert.throws(
    () => createDurableCapture({
      chunkMs: 1_000, extension: "webm", mimeType: "audio/webm",
      sessionId: "r1", targetPath: "u1/r1.webm", upload: async () => undefined, userId: "",
    }),
    /user/i,
  );
});
