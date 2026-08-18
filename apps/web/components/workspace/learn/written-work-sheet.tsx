"use client";

// A page to work on. Scratch paper while you are thinking, and the thing you hand in when you are
// ready — the same surface, doing whichever of those the moment calls for.
//
// 🔴 THERE IS NO SEPARATE MODE FOR THIS, AND THERE MUST NEVER BE. Working something out on paper is
// not a maths feature: a chemistry mechanism, a free-body diagram, a labelled cross-section, a
// pathway reconstructed from memory and a statutory argument laid out in steps are all the same
// act. Nothing in this file, in `written-work.ts` or in `written-response.ts` knows what subject
// the page is about, and nothing may learn.
//
// 🔴 REACHABLE WHILE THINKING, SUBMITTABLE ONLY WHILE SOMETHING IS BEING ASKED, and that split is
// deliberate rather than a limitation. Scratch paper you can only open once a question is on
// screen is not scratch paper; you reach for it BEFORE you have an answer. But submitting written
// work with nothing being asked would produce evidence about no question, which the evidence
// boundary (`objective-task.ts`) refuses on principle: a durable claim that no prompt supports.
// So the sheet opens whenever a session is underway, and grows a submit control only when there is
// something for the work to be an answer to.
//
// 🔴 AND IT DOES NOT WATCH YOU WRITE. Nothing here reads a stroke, grades a line, or sends
// anything anywhere until the learner presses a button. The owner's first requirement, made
// structural: there is exactly one call site for the vision request in this file and it is inside
// an onClick.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { WrittenWork } from "@/lib/handwriting/written-work";
import {
  answersTheSameQuestion,
  renderWriting,
  STALE_READING,
  writingAsConfirmed,
  writingAsRead,
  writtenSubmissionGate,
  type LearnerReading,
} from "@/lib/learn/written-response";
import { cn } from "@/lib/utils";

import { useWrittenWorkCapture } from "./use-written-work-capture";
import { WrittenWorkReview } from "./written-work-review";

interface WrittenWorkSheetProps {
  /**
   * The question this work would answer, or null when nothing is being asked.
   *
   * 🔴 THE ID, NOT A BOOLEAN, because it is also the staleness check. A reading taken while one
   * question was open must not be submitted against the next one, and only the id can tell.
   */
  promptId: string | null;
  /** Hand the work in. The caller supplies the modality and the timing, exactly as it does for a
   *  typed or spoken answer, so nothing about this path is a second submit route. */
  onSubmit: (text: string) => void;
  onClose: () => void;
  /**
   * The ink, kept across the sheet being closed and reopened.
   *
   * 🔴 IT SURVIVES A PROMPT CHANGE, UNLIKE THE COMPOSER'S OLD PAD. Scratch work spans a session:
   * losing a half-finished derivation because the page moved on would make the surface useless for
   * the one thing it is for. What must not survive a prompt change is a READING, and that is
   * guarded by `answersTheSameQuestion` rather than by throwing the learner's work away.
   */
  initialInk: string | null;
  onInkChange: (ink: string | null) => void;
  /** The canvas is already busy with the previous answer. */
  busy: boolean;
}

const INK_WIDTH = 3;
const INK_COLOR = "#1a1a1a";
const PAPER = "#ffffff";

type SheetState =
  | { kind: "page"; message: string | null }
  | { kind: "review"; work: WrittenWork; reason: string };

export function WrittenWorkSheet({
  promptId,
  onSubmit,
  onClose,
  initialInk,
  onInkChange,
  busy,
}: WrittenWorkSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeActive = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const capture = useWrittenWorkCapture();
  const [hasInk, setHasInk] = useState(Boolean(initialInk));
  /**
   * The saved ink has finished being painted back onto the canvas.
   *
   * 🔴 WITHOUT THIS, PUTTING THE PAGE AWAY QUICKLY ERASES IT. Restoring is asynchronous: the mount
   * effect sets `image.src` and paints inside `onload`, while `hasInk` is true from the first
   * render because there IS saved ink. Anything calling `keepInk` in between reads a blank canvas
   * with `toDataURL`, hands that back as the learner's scratch work, and the page they spent five
   * minutes on is gone. The same window would send a blank image to the reader.
   */
  const [restored, setRestored] = useState(!initialInk);
  const [state, setState] = useState<SheetState>({ kind: "page", message: null });
  /** Which question was open when the reading in `state` was taken. */
  const readFor = useRef<string | null>(null);

  // Size the buffer to the rendered box, scale for pixel density, paint the paper, and restore any
  // ink the learner already had. Done once on mount: this is a surface someone writes on for a few
  // minutes, not a resizable editor, and tracking every layout change would cost more machinery
  // than it buys. Restoring the ink is why the effect draws an image at all.
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
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!initialInk) return;
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, rect.width, rect.height);
      setRestored(true);
    };
    // A saved page we cannot repaint is lost either way. Unlocking the surface at least lets the
    // learner carry on rather than leaving them with a sheet that refuses every control for ever.
    image.onerror = () => {
      setRestored(true);
      setHasInk(false);
    };
    image.src = initialInk;
  }, []);

  /** The ink as it stands, for the parent to hold while the sheet is closed. Called on every way
   *  out, so no exit throws the learner's page away. */
  function keepInk() {
    // 🔴 THE PARENT ALREADY HOLDS THE RIGHT ANSWER UNTIL THE RESTORE LANDS. Writing back now would
    // overwrite their saved page with the blank canvas that is on screen while the image loads.
    if (!restored) return;
    const canvas = canvasRef.current;
    onInkChange(canvas && hasInk ? canvas.toDataURL("image/png") : null);
  }

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
    const ctx = canvasRef.current?.getContext("2d");
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
    // Identity transform so the fill covers the raw buffer whatever density scale is applied, then
    // the scale back for the next stroke.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setHasInk(false);
    onInkChange(null);
    setState({ kind: "page", message: null });
  }

  /**
   * Read the page, then decide what may happen to the reading.
   *
   * 🔴 THE GATE RUNS HERE AND NOWHERE ELSE, AND EVERY BRANCH OF IT IS HONOURED. `blocked` shows a
   * message and submits nothing. `confirm` opens the review, which owns the only submit control in
   * that state. `ready` submits directly. There is no fourth path and no way to reach `onSubmit`
   * that has not been through this function.
   */
  async function readWork(blob: Blob) {
    const askedFor = promptId;
    setState({ kind: "page", message: null });
    const reading = await capture.read(blob);
    if (reading.kind === "unavailable") {
      setState({ kind: "page", message: reading.message });
      return;
    }
    // The question may have moved on while the request was in flight, and a page of working filed
    // against the wrong question is evidence about something nobody asked.
    if (!answersTheSameQuestion(askedFor, promptId)) {
      setState({ kind: "page", message: STALE_READING });
      return;
    }
    readFor.current = askedFor;

    const gate = writtenSubmissionGate(reading.work);
    if (gate.kind === "blocked") {
      setState({ kind: "page", message: gate.reason });
      return;
    }
    if (gate.kind === "confirm") {
      setState({ kind: "review", reason: gate.reason, work: reading.work });
      return;
    }
    keepInk();
    onSubmit(renderWriting(writingAsRead(reading.work)));
  }

  function readDrawing() {
    const canvas = canvasRef.current;
    // `restored` for the same reason `keepInk` checks it: reading before the saved page is painted
    // back would send a blank image and judge them on an empty answer.
    if (!canvas || !restored || !hasInk || capture.busy || !promptId) return;
    canvas.toBlob((blob) => {
      if (blob) void readWork(blob);
    }, "image/png");
  }

  function readPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && promptId) void readWork(file);
  }

  function confirmReading(reading: LearnerReading) {
    if (state.kind !== "review") return;
    // Checked again at the moment of submission, not only when the reading came back: the review
    // step is where a learner spends the most time, and the question can move on underneath it.
    if (!answersTheSameQuestion(readFor.current, promptId)) {
      setState({ kind: "page", message: STALE_READING });
      return;
    }
    keepInk();
    onSubmit(renderWriting(writingAsConfirmed(state.work, reading)));
  }

  if (state.kind === "review") {
    return (
      <WrittenWorkReview
        busy={busy}
        onCancel={() => setState({ kind: "page", message: null })}
        onConfirm={confirmReading}
        reason={state.reason}
        work={state.work}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[26px] bg-(--ui-bg-elevated) p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
      <p className="px-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        {promptId
          ? "Work it out here. Nothing is read until you hand it in."
          : "Scratch paper. Nothing here is read or marked. It stays while you work."}
      </p>

      <canvas
        aria-label="Work out your answer here"
        className="h-[min(52vh,420px)] w-full touch-none rounded-2xl bg-white"
        onPointerCancel={endStroke}
        onPointerDown={startStroke}
        onPointerLeave={endStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        ref={canvasRef}
      />

      {state.message && (
        <p aria-live="polite" className="px-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            aria-label="Clear the page"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={capture.busy}
            onClick={clear}
            title="Clear the page"
            type="button"
          >
            <Codicon name="clear-all" size="18px" />
          </button>
          {/* 🔴 ONLY OFFERED WHEN THERE IS SOMETHING TO ANSWER, like the submit control beside it.
              A photo goes straight to the reader, so offering it as scratch paper would be a
              vision call that could produce nothing. */}
          {promptId && (
            <button
              aria-label="Photograph work you did on paper"
              className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
              disabled={capture.busy}
              onClick={() => filePicker.current?.click()}
              title="Photograph work you did on paper"
              type="button"
            >
              <Codicon name="device-camera" size="18px" />
            </button>
          )}
          {/* The same accept list lib/vision/gemini.ts's VISION_IMAGE_MIMES already reads.
              capture="environment" prefers a phone's rear camera and is ignored elsewhere. */}
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
            aria-label="Put the page away"
            className="flex h-[36px] w-[36px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            disabled={capture.busy}
            onClick={() => {
              keepInk();
              onClose();
            }}
            title="Put the page away"
            type="button"
          >
            <Codicon name="close" size="18px" />
          </button>
          {/* 🔴 ABSENT, NOT DISABLED, WHEN NOTHING IS BEING ASKED. The composer's own §I rule: a
              greyed control still advertises that pressing it is an option, and here there is no
              question for the work to be an answer to. */}
          {promptId && (
            <button
              className={cn(
                "flex h-[36px] items-center justify-center gap-1.5 rounded-full px-4",
                "bg-(--ui-action) text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor)",
                "transition-opacity hover:opacity-90 disabled:opacity-40",
              )}
              disabled={!restored || !hasInk || capture.busy || busy}
              onClick={readDrawing}
              type="button"
            >
              <Codicon name={capture.busy ? "loading" : "arrow-up"} size="16px" spinning={capture.busy} />
              {capture.busy ? "Reading your page…" : "Hand this in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
