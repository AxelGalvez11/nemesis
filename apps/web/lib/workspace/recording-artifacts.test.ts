import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toRecordingArtifact } from "./recording-artifacts";

describe("toRecordingArtifact", () => {
  it("maps a persisted recording to the app model", () => {
    assert.deepEqual(toRecordingArtifact({
      id: "a1",
      surface: "sessions",
      context_id: "s1",
      title: "Lecture",
      transcript: "spoken words",
      notes: "- idea",
      duration_seconds: 92.4,
      created_at: "2026-07-20T12:00:00.000Z",
    }), {
      id: "a1",
      surface: "sessions",
      contextId: "s1",
      title: "Lecture",
      transcript: "spoken words",
      notes: "- idea",
      durationSeconds: 92,
      createdAt: "2026-07-20T12:00:00.000Z",
    });
  });

  it("rejects malformed rows", () => {
    assert.equal(toRecordingArtifact({ id: "a1", surface: "unknown" }), null);
  });
});
