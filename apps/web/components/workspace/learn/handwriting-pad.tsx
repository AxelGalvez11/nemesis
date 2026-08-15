"use client";

// Answering with handwriting or a drawing instead of typing or speaking — a third way to fill the
// ONE composer, alongside the keyboard and dictation (canvas-composer.tsx's own header: "there is
// no second answer box").
//
// 🔴 TAKES THE COMPOSER'S PLACE, LIKE DICTATION, AND DOES NOT AUTO-SUBMIT, LIKE DICTATION.
// `acceptDictation`'s own comment: "It lands in the composer as editable text; it does NOT
// submit. Speech recognition mishears, and auto-submitting would make a transcription error
// indistinguishable from a wrong answer in the evidence." Vision OCR mishears exactly the same
// way a microphone does, for the same reason: a photograph of handwriting is read, not measured.
// So a successful read lands in the composer as ordinary, editable text and waits for the
// learner to press Send — the same control, the same review step, the same evidence path typed
// and spoken answers already use. Nothing here is a second way to submit an answer; it is a
// third way to fill the box the one submit button already sends.
//
// 🔴 WHY THIS NEVER TOUCHES `via`. `canvas-composer.tsx`'s `onAnswer` takes `via: "typed" |
// "spoken"`, a union that lives in lib/learn/canvas-model.ts and is read downstream to interpret
// response latency differently for speech and typing. There is no third value for "drawn", and
// this component does not invent one by relabelling: text placed here is submitted as `"typed"`
// when the learner presses Send, which is honest in the way that matters for that signal — a
// learner who drew or wrote by hand and then reviewed the result before sending took roughly
// keyboard-speed to produce it, not speech-speed, so `"typed"` is the closer of the two available
// labels rather than a lie of convenience. Provenance (that the text came from a photo or a
// drawing) lives on the HandwritingObservation this pad produced, not on `via` — see the task
// report's handoff notes for what lib/learn would need to carry that provenance any further.
import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";

import { useHandwritingCapture } from "./use-handwriting-capture";

interface HandwritingPadProps {
  /** A reading came back as usable text. Lands in the composer, editable, unsent. */
  onAccept: (text: string) => void;
  /** Close the pad without changing anything the composer already held. */
  onCancel: () => void;
}

/** Stroke width in CSS pixels — the canvas is scaled to devicePixelRatio in the mount effect
 *  below, so every drawing coordinate in this file is already in CSS-pixel space. */
const INK_WIDTH = 3;
const INK_COLOR = "#1a1a1a";

export function HandwritingPad({ onAccept, onCancel }: HandwritingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeActive = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const capture = useHandwritingCapture();
  const [hasInk, setHasInk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Size the drawing buffer to the canvas's actual rendered size, scaled for the display's pixel
  // density, and paint it white. Done once on mount rather than tracked with a resize observer —
  // this pad is a short-lived capture surface, not a persistent drawing tool, and matching every
  // layout change is more machinery than a few seconds of use justifies.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (capture.busy) return;
    const point = pointFrom(event);
    if (!point) return;
    strokeActive.current = true;
    lastPoint.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!strokeActive.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = pointFrom(event);
    if (!ctx || !point || !lastPoint.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = INK_WIDTH;
    ctx.strokeStyle = INK_COLOR;
    ctx.stroke();
    lastPoint.current = point;
    setHasInk(true);
  }

  function endStroke() {
    strokeActive.current = false;
    lastPoint.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Reset to the identity transform so fillRect covers the whole raw buffer regardless of the
    // devicePixelRatio scale the mount effect applied, then restore that scale for the next stroke.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasInk(false);
    setMessage(null);
  }

  async function send(blob: Blob) {
    setMessage(null);
    const outcome = await capture.analyze(blob);
    if (outcome.kind === "text") onAccept(outcome.text);
    else setMessage(outcome.message);
  }

  function readDrawing() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || capture.busy) return;
    canvas.toBlob((blob) => {
      if (blob) void send(blob);
    }, "image/png");
  }

  function readPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void send(file);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[26px] bg-(--ui-bg-elevated) p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
      <p className="px-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        Write or draw your answer, then press Read this.
      </p>

      <canvas
        aria-label="Draw or write your answer here"
        className="h-[180px] w-full touch-none rounded-2xl bg-white"
        onPointerCancel={endStroke}
        onPointerDown={startStroke}
        onPointerLeave={endStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        ref={canvasRef}
      />

      {message && (
        <p aria-live="polite" className="px-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          {message}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            aria-label="Clear"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={capture.busy}
            onClick={clear}
            title="Clear"
            type="button"
          >
            <Codicon name="clear-all" size="18px" />
          </button>
          <button
            aria-label="Use a photo instead"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={capture.busy}
            onClick={() => filePicker.current?.click()}
            title="Use a photo instead"
            type="button"
          >
            <Codicon name="file-media" size="18px" />
          </button>
          {/* capture="environment" prefers the rear camera on a phone, and is ignored elsewhere —
              the same accept list lib/vision/gemini.ts's VISION_IMAGE_MIMES already reads. */}
          <input
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            capture="environment"
            className="sr-only"
            onChange={readPhoto}
            ref={filePicker}
            tabIndex={-1}
            type="file"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label="Cancel"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={capture.busy}
            onClick={onCancel}
            title="Cancel"
            type="button"
          >
            <Codicon name="close" size="18px" />
          </button>
          <button
            aria-label="Read this"
            className="flex h-[36px] items-center justify-center gap-1.5 rounded-full bg-(--ui-action) px-4 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!hasInk || capture.busy}
            onClick={readDrawing}
            type="button"
          >
            <Codicon name={capture.busy ? "loading" : "check"} size="16px" spinning={capture.busy} />
            {capture.busy ? "Reading…" : "Read this"}
          </button>
        </div>
      </div>
    </div>
  );
}
