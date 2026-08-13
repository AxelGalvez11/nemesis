"use client";

// The canvas before it holds anything: ask for material, or for a topic.
//
// 🔴 THIS IS NOT A STAGE, AND THAT IS WHY IT IS STILL HERE. It was filed inside
// `canvas-stages.tsx` with the six-stage machine and came within one commit of being deleted
// alongside it. `empty` is a PRE-CONTENT state (`canvas-hosting.ts` → `PRE_CONTENT_STATES`), not an
// evidence stage: nothing blocks a canvas from being in it, and `canvas-store.ts` does not coerce
// it to `learn` on read the way it does every retired stage. Deleting it with the machine would
// have painted nothing at all for the one group of users who have added no material yet.
//
// Its own file now, so the next deletion of a stage cannot take it by accident.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

export function CanvasEmpty({
  onFiles,
  onTopic,
  busy,
}: {
  onFiles: (files: FileList | File[]) => void;
  onTopic: (topic: string) => void;
  busy: boolean;
}) {
  const [over, setOver] = useState(false);
  const [topic, setTopic] = useState("");

  return (
    <div
      className="flex min-h-full items-center justify-center px-6"
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
      }}
    >
      <div className="w-full max-w-[32rem] text-center">
        <h1 className="text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
          What do you want to learn?
        </h1>

        <label
          className={cn(
            "mt-8 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 transition-colors",
            over ? "border-(--ui-accent) bg-(--ui-bg-tertiary)" : "border-(--ui-stroke-primary) hover:bg-(--ui-bg-tertiary)",
          )}
        >
          <Codicon name={busy ? "loading" : "cloud-upload"} size="1.125rem" spinning={busy} />
          <span className="text-[0.875rem] text-(--ui-text-secondary)">
            {busy ? "Reading your material…" : "Drop a lecture, slides, PDF, or other material"}
          </span>
          <span className="text-[0.75rem] text-(--ui-text-quaternary)">PDF, Word, PowerPoint, text, or an image of a page</span>
          <input
            accept=".pdf,.docx,.pptx,.md,.txt,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.heic"
            className="hidden"
            multiple
            onChange={(event) => event.target.files && onFiles(event.target.files)}
            type="file"
          />
        </label>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
          <span className="text-[0.75rem] text-(--ui-text-quaternary)">or</span>
          <span className="h-px flex-1 bg-(--ui-stroke-tertiary)" />
        </div>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (topic.trim()) onTopic(topic.trim());
          }}
        >
          <input
            className="w-full rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-4 py-3 text-center text-[0.9375rem] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-accent)"
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Teach me something…"
            value={topic}
          />
        </form>
      </div>
    </div>
  );
}

/* 🔴 CARRIED OVER FROM THE DELETED `canvas-stages.tsx`, BECAUSE IT IS A STANDING RULE ABOUT THIS
 * SURFACE RATHER THAN A NOTE ABOUT A DELETED COMPONENT. `CanvasOrient` used to sit between this
 * screen and the lesson.
 *
 * It asked "Where should we start?" and offered four labels — Start from fundamentals / I know the
 * basics / Advanced / Exam-focused — before Nemesis had used a single thing it already knew. It was
 * a static mode selector wearing a question mark, and it was the six-stage machine's defect at a
 * different scale: a route chosen before anything about the learner had been established.
 *
 * It was also a poor input. Two people who pick "I know the basics" know completely different
 * things, and the answer names no concept, no demonstrated capability, no misconception and nothing
 * that has decayed. A learner can be wrong about their own level; what they DO is evidence, and
 * what they say about themselves is a self-report.
 *
 * 🔴 DO NOT REPLACE IT WITH THREE STATIC QUESTIONS. "How familiar are you?" / "What's your goal?" /
 * "When is your exam?" is the same form with more steps. Ask only what genuinely cannot be
 * inferred, and prefer a task that REVEALS the learner over a question ABOUT them: "Which ion
 * carries phase 0?" produces evidence, "Are you familiar with cardiac action potentials?" produces
 * a guess. Where real ambiguity remains ("teach me World War II"), the composer can ask in words —
 * it does not need a permanent four-button taxonomy.
 */
