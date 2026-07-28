import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRecordingBlob,
  isCapturing,
  isFinishing,
  pickRecordingFormat,
  pollDelayMs,
  POLL_TIMEOUT_MS,
  RECORDING_BITS_PER_SECOND,
  RECORDING_MAX_BYTES,
  RECORDING_MIME_PREFERENCE,
  recordingStatusCopy,
  recordingStoragePath,
} from "./recording-capture";

// The bucket's allowed_mime_types is [audio/mp4, audio/m4a, audio/aac,
// audio/mpeg, audio/webm]. Recording into a container it will not accept means
// losing the lecture at the upload, after the student has already spoken it.
test("we only ever record into a container the bucket accepts", () => {
  const allowed = ["audio/mp4", "audio/m4a", "audio/aac", "audio/mpeg", "audio/webm"];
  for (const mimeType of RECORDING_MIME_PREFERENCE) {
    const base = mimeType.split(";")[0] ?? mimeType;
    assert.ok(allowed.includes(base), `${mimeType} is not in the bucket allow-list`);
  }
});

// MediaRecorder reports "audio/webm;codecs=opus"; the allow-list holds bare
// types. Uploading the parameterised string risks a rejection for a container
// the bucket actually accepts.
test("the codec parameter is stripped before upload", () => {
  assert.deepEqual(describeRecordingBlob("audio/webm;codecs=opus"), { contentType: "audio/webm", extension: "webm" });
  assert.deepEqual(describeRecordingBlob("audio/mp4;codecs=mp4a.40.2"), { contentType: "audio/mp4", extension: "m4a" });
  assert.deepEqual(describeRecordingBlob("AUDIO/WEBM"), { contentType: "audio/webm", extension: "webm" });
  assert.deepEqual(describeRecordingBlob(""), { contentType: "audio/webm", extension: "webm" }, "a blob with no type still uploads");
});

// The bitrate is what decides how long a lecture can be, because the bucket
// caps the file rather than the duration.
test("the bitrate keeps a full lecture inside the 40 MB bucket cap", () => {
  const bytesPerSecond = RECORDING_BITS_PER_SECOND / 8;
  const hours = RECORDING_MAX_BYTES / bytesPerSecond / 3600;
  assert.ok(hours >= 2.5, `only ${hours.toFixed(1)}h fits`);
});

test("Chrome and Firefox get Opus in WebM", () => {
  const format = pickRecordingFormat((type) => type.startsWith("audio/webm"));
  assert.equal(format.mimeType, "audio/webm;codecs=opus");
  assert.equal(format.extension, "webm");
});

// Safari refuses WebM entirely and records MP4/AAC. Both transcription
// providers accept it, so this is a fallback rather than a failure — a recorder
// that threw here would lose the lecture on an entire browser.
test("Safari falls back to MP4 rather than failing", () => {
  const format = pickRecordingFormat((type) => type.startsWith("audio/mp4"));
  assert.equal(format.mimeType, "audio/mp4;codecs=mp4a.40.2");
  assert.equal(format.extension, "m4a");
});

test("a browser that supports nothing still returns a usable shape", () => {
  const format = pickRecordingFormat(() => false);
  assert.equal(format.mimeType, "", "empty means: let the browser choose");
  assert.equal(format.extension, "webm");
});

// Not cosmetic: /api/transcription/submit rejects any path that does not start
// with the caller's own id, which is what stops one account submitting
// another's audio. Getting this prefix wrong is a 403, not a bad filename.
test("the storage path is namespaced to the owner", () => {
  const path = recordingStoragePath("user-123", "abc-def", "webm");
  assert.equal(path, "user-123/abc-def.webm");
  assert.ok(path.startsWith("user-123/"));
});

// Groq transcribes inside the submit request and parks its text, so the first
// poll usually already has it — hence a fast first gap. AssemblyAI is the slow
// fallback and will not answer sooner for being asked more often.
test("polling starts fast and then backs off", () => {
  assert.equal(pollDelayMs(1), 800);
  assert.ok(pollDelayMs(3) > pollDelayMs(1));
  assert.ok(pollDelayMs(8) > pollDelayMs(3));
  assert.ok(pollDelayMs(50) >= pollDelayMs(20));
  // Monotonic, so a long job never polls faster as it ages.
  for (let attempt = 2; attempt < 40; attempt += 1) {
    assert.ok(pollDelayMs(attempt) >= pollDelayMs(attempt - 1), `attempt ${attempt}`);
  }
});

test("the poll window is long enough for a slow batch job", () => {
  assert.ok(POLL_TIMEOUT_MS >= 10 * 60 * 1_000);
});

// Speech, not music: an hour at this rate is about 14 MB, which uploads on a
// lecture-hall connection and stays well inside the bucket's file cap.
test("the bitrate is sized for speech", () => {
  assert.ok(RECORDING_BITS_PER_SECOND <= 48_000);
  const megabytesPerHour = (RECORDING_BITS_PER_SECOND * 3600) / 8 / 1_000_000;
  assert.ok(megabytesPerHour < 20, `${megabytesPerHour} MB/hour`);
});

test("status copy says what is happening, without jargon", () => {
  assert.equal(recordingStatusCopy("recording"), "Recording");
  assert.equal(recordingStatusCopy("uploading"), "Saving audio");
  assert.equal(recordingStatusCopy("transcribing"), "Writing it up");
  assert.equal(recordingStatusCopy("idle"), "Ready");
});

// The panel must keep its spinner while the transcript is in flight. Looking
// finished at the moment the microphone closes is what would make someone
// navigate away and lose the write-up.
test("the microphone and the work after it are different states", () => {
  assert.equal(isCapturing("recording"), true);
  assert.equal(isCapturing("transcribing"), false);
  assert.equal(isFinishing("uploading"), true);
  assert.equal(isFinishing("transcribing"), true);
  assert.equal(isFinishing("recording"), false);
  assert.equal(isFinishing("idle"), false);
});
