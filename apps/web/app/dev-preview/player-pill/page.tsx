"use client";

// DEV-ONLY PREVIEW — the SHIPPED read-aloud player, in the row it lives in.
//
// The options board (/dev-preview/voice-audio-player) drew six candidates from replica markup. This
// page draws the real `CanvasAudioBar` against a hand-written `ResponseAudio`, so what is on screen
// is the component the canvas mounts rather than a drawing of it: the same doctrine as the figure
// previews, real component with a scripted world.

import { useEffect, useState } from "react";

import { CanvasAudioBar } from "@/components/workspace/learn/canvas-audio-bar";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { ResponseAudio } from "@/components/workspace/learn/use-response-audio";

/** A player that is not playing anything: every field is a value, every control a no-op. */
function stub(over: Partial<ResponseAudio>): ResponseAudio {
  return {
    complete: false,
    currentTime: 0,
    cycleRate: () => undefined,
    failure: null,
    playing: false,
    prime: () => undefined,
    primedOpener: () => null,
    rate: 1,
    reach: 0,
    scrub: () => undefined,
    seekBy: () => undefined,
    settleStream: () => undefined,
    start: () => undefined,
    status: "active",
    stop: () => undefined,
    toggle: () => undefined,
    ...over,
  };
}

function Row({ audio, label }: { audio: ResponseAudio; label: string }) {
  return (
    <div>
      <p className="mb-[6px] text-[12px] text-(--ui-text-tertiary)">{label}</p>
      <div className="flex h-[56px] items-center gap-[10px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) px-[14px]">
        <CanvasAudioBar audio={audio} />
        <span className="flex-1 truncate text-[14px] text-(--ui-text-tertiary)">Enzymes and activation energy</span>
        <span className="flex items-center gap-1 text-(--ui-text-tertiary)">
          <span className="flex h-[36px] w-[36px] items-center justify-center"><Codicon name="list-unordered" size="20px" /></span>
          <span className="flex h-[36px] w-[36px] items-center justify-center"><Codicon name="map" size="20px" /></span>
          <span className="flex h-[36px] w-[36px] items-center justify-center"><Codicon name="output" size="20px" /></span>
        </span>
      </div>
    </div>
  );
}

export default function PlayerPillPreview() {
  // The real thing alternates; alternate here too, so a screenshot can catch either state.
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const timer = window.setInterval(() => setPlaying((was) => !was), 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main data-workspace className="min-h-screen bg-(--ui-bg) px-[56px] py-[44px] text-(--ui-text-primary)">
      <h1 className="mb-[28px] text-[15px] font-semibold">The read-aloud player, as it ships</h1>
      <div className="flex max-w-[980px] flex-col gap-[26px]">
        <Row audio={stub({ playing: true })} label="playing" />
        <Row audio={stub({ playing: false })} label="paused" />
        <Row audio={stub({ status: "loading" })} label="loading (the answer is being synthesised)" />
        <Row audio={stub({ playing })} label={`alternating every 4s — currently ${playing ? "playing" : "paused"}`} />
        <Row audio={stub({ status: "idle" })} label="idle: no pill at all, and it takes no width from the title" />
      </div>
    </main>
  );
}
