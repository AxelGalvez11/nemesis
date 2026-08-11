"use client";

// "Recording interrupted." — the screen that makes durable parts reachable again.
//
// 🔴 THIS IS PART OF THE DURABILITY FEATURE, NOT POLISH ON TOP OF IT. Parts have been landing in
// storage during capture for a while; until this existed, a crashed lecture was safe and
// unreachable, which from the student's side is exactly the same as lost. A recovery path the
// learner has to discover is not a recovery path.
//
// 🔴 IT CANNOT START A RECORDING. There is no route from here to the microphone: recovering
// audio already captured and opening a new capture are different operations, and a student
// returning to a crashed tab must never find themselves unexpectedly live. "Save what was
// captured" is the whole offer.
//
// Restrained on purpose. It appears once, above the composer, and goes away for good once it is
// answered — one row, three plain choices, no badge, no banner that follows them around.

import { useCallback, useEffect, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { forgetManifest, storedManifests } from "@/lib/workspace/recording-durable-capture";
import { approximateSeconds, recoverable, retirable, type RecordingManifest } from "@/lib/workspace/recording-manifest";
import { sessionsStore } from "@/lib/workspace/sessions-store";
import { recoveryOffer, recoveryRequest, type RecoveryOffer } from "@/lib/workspace/recording-recovery";

/** What a recovered recording is filed under, so it reads as itself in the Library rather than
 *  as an ordinary session that happens to be missing its beginning. */
const RECOVERED_TITLE = "Recovered recording";

/** The ceiling /api/recordings/jobs enforces, mirrored so a long lecture is clamped rather than
 *  refused at the last step. */
const MAX_JOB_SECONDS = 3 * 60 * 60;

type Phase = "offering" | "saving" | "saved" | "failed" | "quota";

interface Props {
  accessToken: string | null;
  /** Where a recovered recording is filed. Same hand-off a normal finish uses. */
  onRecovered?: (storagePath: string) => void;
}

export function RecordingRecoveryNotice({ accessToken, onRecovered }: Props) {
  const [manifest, setManifest] = useState<RecordingManifest | null>(null);
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  const [phase, setPhase] = useState<Phase>("offering");

  useEffect(() => {
    const now = new Date();
    const stored = storedManifests();

    // Records that can never become an offer are dropped rather than left to accumulate — a
    // set with no first part is undecodable however long it is kept. `retirable` is what makes
    // this safe to do on every load: it only touches sessions that have gone quiet, so a
    // lecture being recorded in another tab right now is never swept up in it.
    for (const dead of retirable(stored, now)) forgetManifest(dead.sessionId);

    // The newest interrupted recording is the one worth asking about; older ones stay on the
    // list and are offered next time rather than stacking up as a wall of cards.
    const found = recoverable(stored, now)[0];
    if (!found) return;
    const next = recoveryOffer(found);
    if (!next) return;
    setManifest(found);
    setOffer(next);
  }, []);

  const dismiss = useCallback(() => {
    if (manifest) forgetManifest(manifest.sessionId);
    setManifest(null);
    setOffer(null);
  }, [manifest]);

  const save = useCallback(async () => {
    if (!manifest || !accessToken) return;
    setPhase("saving");
    try {
      const response = await fetch("/api/recordings/recover", {
        body: JSON.stringify(recoveryRequest(manifest)),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json().catch(() => null) as { storagePath?: string } | null;
      if (!response.ok || !body?.storagePath) throw new Error("rebuild failed");

      // 🔴 REBUILDING THE FILE IS NOT SAVING THE RECORDING. Without this second call the audio
      // sits in storage, correct and complete, and is never transcribed or written up — which
      // to the student is still a lost lecture, just a more expensive one. The recovered file
      // goes through the SAME route a normal finish uses, so it gets the same job, the same
      // artifact and the same Library note.
      const created = await fetch("/api/recordings/jobs", {
        body: JSON.stringify({
          contextId: sessionsStore.create(RECOVERED_TITLE).id,
          // Clamped to the pipeline's own ceiling. This estimate is derived from the part
          // cadence, so a lecture that ran a little past three hours would otherwise be refused
          // with a 400 — losing the recording to a rounding artefact at the very last step.
          durationSeconds: Math.min(MAX_JOB_SECONDS, Math.max(1, approximateSeconds(manifest))),
          messageId: crypto.randomUUID(),
          storagePath: body.storagePath,
          surface: "sessions",
        }),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        method: "POST",
      });
      // 🔴 Over the monthly allowance is NOT a failure to rebuild, and saying so would send
      // someone looking for a network problem that does not exist. The audio IS rebuilt and
      // safe at this point; what is missing is the entitlement to transcribe it. The manifest
      // is deliberately still kept, so they can accept it after their allowance resets.
      if (created.status === 429) {
        setPhase("quota");
        return;
      }
      if (!created.ok) throw new Error("queue failed");

      // The local record is dropped only AFTER both calls succeeded. Dropping it earlier would
      // retire the recovery record for a recording whose rebuild then failed — the one moment
      // those parts are worth the most.
      forgetManifest(manifest.sessionId);
      setPhase("saved");
      onRecovered?.(body.storagePath);
    } catch {
      setPhase("failed");
    }
  }, [accessToken, manifest, onRecovered]);

  const discard = useCallback(async () => {
    if (!manifest) return;
    const request = recoveryRequest(manifest);
    dismiss();
    // Best effort, and deliberately after the notice is gone: the student said no, and making
    // them wait on a storage delete to dismiss a card would be the app arguing with them.
    if (!accessToken) return;
    await fetch("/api/recordings/recover", {
      body: JSON.stringify({ parts: request.parts }),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      method: "DELETE",
    }).catch(() => undefined);
  }, [accessToken, dismiss, manifest]);

  if (!offer) return null;

  if (phase === "saved") {
    return (
      <Row>
        <Codicon name="check" size="0.8125rem" />
        <span className="text-(--ui-text-secondary)">Recording saved. Nemesis is writing it up.</span>
      </Row>
    );
  }

  return (
    <Row>
      <Codicon name="warning" size="0.8125rem" />
      <div className="min-w-0 flex-1">
        <span className="text-(--ui-text-primary)">Recording interrupted</span>
        <span className="text-(--ui-text-tertiary)"> · about {offer.duration} recovered</span>
        {offer.caveat && <p className="mt-0.5 text-[0.75rem] text-(--ui-text-tertiary)">{offer.caveat}</p>}
        {phase === "failed" && (
          <p className="mt-0.5 text-[0.75rem] text-(--ui-text-tertiary)">
            That did not rebuild. Your audio is still saved — try again in a moment.
          </p>
        )}
        {phase === "quota" && (
          <p className="mt-0.5 text-[0.75rem] text-(--ui-text-tertiary)">
            Your audio is saved, but this month&rsquo;s transcription limit is used up. It will be
            waiting here when the limit resets.
          </p>
        )}
      </div>
      <button
        className="shrink-0 rounded-full bg-(--ui-bg-tertiary) px-3 py-1 text-[0.75rem] text-(--ui-text-primary) hover:bg-(--ui-bg-quaternary) disabled:opacity-50"
        disabled={phase === "saving" || !accessToken}
        onClick={() => void save()}
        type="button"
      >
        {phase === "saving" ? "Saving…" : "Save what was captured"}
      </button>
      <button
        className="shrink-0 px-2 py-1 text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
        onClick={() => void discard()}
        type="button"
      >
        Discard
      </button>
    </Row>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[770px] items-center gap-2.5 rounded-xl bg-(--ui-bg-elevated) px-3.5 py-2.5 text-[0.8125rem] text-(--ui-text-tertiary) ring-1 ring-(--ui-stroke-tertiary)">
      {children}
    </div>
  );
}
