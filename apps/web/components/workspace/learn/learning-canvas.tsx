"use client";

// The Learning Canvas surface.
//
// One page that becomes whatever the learner needs next. There is no message list, no
// assistant column, and no route change between reading, recalling and being tested — the
// canvas itself is the interface, and the command bar is the only control.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { nextAction } from "@/lib/learn/canvas-state";

import { CanvasComposer } from "./canvas-composer";
import { CanvasDocument } from "./canvas-document";
import { CanvasHeader } from "./canvas-header";
import {
  CanvasComplete,
  CanvasDiagnosis,
  CanvasEmpty,
  CanvasOrient,
  CanvasRecall,
  CanvasTest,
} from "./canvas-stages";
import { useCanvasSession } from "./use-canvas-session";

export function LearningCanvas({ canvasId }: { canvasId: string | null }) {
  const router = useRouter();
  const session = useCanvasSession(canvasId);
  const { canvas, busy, error } = session;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selected = useMemo(
    () => canvas.blocks.filter((block) => selectedIds.includes(block.id)),
    [canvas.blocks, selectedIds],
  );

  // 🔴 `selectionchange` fires continuously while a drag is in progress, so recording an event
  // per call produced dozens of canvas_text_selected rows for one highlight — and the canvas it
  // was given was a fabricated `{id:"", state:"learn"}`, so `canvas_id` was blank and nothing
  // could be joined to it. One event per distinct selection, carrying the real canvas.
  const lastSelection = useRef<string>("");
  const onSelect = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids);
      const key = ids.join(",");
      if (key === lastSelection.current) return;
      lastSelection.current = key;
      canvasCapture("canvas_text_selected", canvas, { blocks: ids.length });
    },
    [canvas],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    lastSelection.current = "";
    window.getSelection()?.removeAllRanges();
  }, []);

  // Leaving a canvas that was started but never finished is the number the pilot is being
  // judged on as much as completion is. Recorded on unmount, reading a ref so the value is the
  // state at the moment of leaving rather than the one captured when the effect was set up.
  const leaving = useRef(canvas);
  leaving.current = canvas;
  useEffect(
    () => () => {
      const last = leaving.current;
      if (last.state !== "complete" && last.state !== "empty") {
        canvasCapture("canvas_abandoned", last, {
          blocks: last.blocks.length,
          answered: last.answers.length,
          activeMs: last.activeMs,
        });
      }
    },
    [],
  );

  const submit = useCallback(
    async (text: string) => {
      // "Where did this come from?" is answered about the highlighted passage rather than by
      // rewriting it — asking about a claim should never silently change the claim.
      const only = selected.length === 1 ? selected[0] : null;
      if (only && /^(where|which source|what source)\b/i.test(text)) {
        canvasCapture("canvas_source_asked", canvas, {});
        await session.askAbout(only, text);
        return;
      }
      await session.command(text, selected);
      clearSelection();
    },
    [canvas, clearSelection, selected, session],
  );

  // The diagnosis and the completion state print their own primary action in the page, where
  // it belongs — offering the same words twice on one screen is noise, not reassurance.
  const OWN_ACTION: readonly string[] = ["diagnose", "complete"];
  const next = OWN_ACTION.includes(canvas.state) ? null : nextAction(canvas);
  const advance = useCallback(() => {
    if (!next) return;
    if (next.to === "recall") void session.startRecall();
    else if (next.to === "test") void session.startTest();
    else if (next.to === "diagnose") session.finishTest();
    else if (next.to === "targeted_relearn") void session.relearn();
    else if (next.to === "retest") void session.startRetest();
    else if (next.to === "complete") session.finish();
  }, [next, session]);

  if (!session.ready) {
    return <main className="flex h-full items-center justify-center bg-(--ui-bg-editor)" />;
  }

  // Reading and testing get a quiet command bar; the empty and orientation states have their
  // own inputs and would be muddled by a second one.
  const showComposer = !["empty", "orient", "complete"].includes(canvas.state);
  const dimComposer = ["recall", "test", "retest"].includes(canvas.state);

  return (
    <main className="relative flex h-full min-h-0 flex-col bg-(--ui-bg-editor)">
      <CanvasHeader
        busy={busy.kind !== null}
        canvas={canvas}
        next={next}
        onAdvance={advance}
        onExit={() => router.push("/sessions")}
        onFiles={(files) => void session.attachFiles(files)}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {canvas.state === "empty" && (
          <CanvasEmpty
            busy={busy.kind === "source"}
            onFiles={(files) => void session.attachFiles(files)}
            onTopic={(topic) => session.begin(topic)}
          />
        )}

        {canvas.state === "sources_attached" && <SourcesAttached session={session} />}

        {canvas.state === "orient" && (
          <CanvasOrient busy={busy.kind === "lesson"} canvas={canvas} onChoose={(level) => void session.chooseLevel(level)} />
        )}

        {["learn", "targeted_relearn"].includes(canvas.state) && (
          <CanvasDocument
            aside={session.aside}
            busyBlockIds={busy.blockIds ?? []}
            canvas={canvas}
            onAskSource={(block: CanvasBlock) => void session.askAbout(block, "Where in my material did this come from?")}
            onDismissAside={session.dismissAside}
            onMarkKnown={session.markKnown}
            onSelect={onSelect}
            onToggleCollapsed={session.toggleCollapsed}
            selectedIds={selectedIds}
          />
        )}

        {canvas.state === "recall" && (
          <CanvasRecall
            canvas={canvas}
            cards={canvas.recall}
            judging={session.judging}
            onAttempt={(cardId, text, via) => void session.attemptRecall(cardId, text, via)}
            onDone={() => void session.startTest()}
            onReveal={(cardId) => void session.revealRecall(cardId)}
          />
        )}

        {["test", "retest"].includes(canvas.state) && (
          <CanvasTest
            canvas={canvas}
            judging={session.judging}
            onAnswer={session.answer}
            onFinish={session.finishTest}
            onRespond={(questionId, text, via, tookMs) => void session.respond(questionId, text, via, tookMs)}
          />
        )}

        {canvas.state === "diagnose" && (
          <CanvasDiagnosis
            busy={busy.kind === "relearn"}
            canvas={canvas}
            onFinish={session.finish}
            onRelearn={() => void session.relearn()}
          />
        )}

        {canvas.state === "complete" && <CanvasComplete canvas={canvas} onReset={session.reset} />}

        {/* A whole-page job says so once, in the middle, rather than blanking the document. */}
        {(busy.kind === "lesson" || busy.kind === "recall" || busy.kind === "test" || busy.kind === "relearn") &&
          canvas.state !== "orient" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-(--ui-bg-editor)/70">
              <p className="flex items-center gap-2 text-[0.875rem] text-(--ui-text-secondary)">
                <Codicon name="loading" size="0.875rem" />
                {busy.label}…
              </p>
            </div>
          )}
      </div>

      {error && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="flex max-w-[38rem] items-start gap-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-4 py-3 shadow-lg">
            <p className="text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">{error}</p>
            <button
              aria-label="Dismiss"
              className="mt-0.5 text-(--ui-text-quaternary) hover:text-(--ui-text-primary)"
              onClick={session.dismissError}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>
        </div>
      )}

      {showComposer && (
        <CanvasComposer
          busy={busy.kind === "command"}
          busyLabel={busy.label}
          dimmed={dimComposer}
          onClearSelection={clearSelection}
          onSubmit={(text) => void submit(text)}
          placeholder={
            // During a test the answer box is the thing being typed into, so this bar has to
            // say what it is FOR — otherwise "Ask about this card…" reads as the place to put
            // the answer, and the answer goes to the wrong box.
            ["test", "retest"].includes(canvas.state)
              ? "Ask about this question…"
              : dimComposer
                ? "Ask about this card…"
                : "Ask Nemesis or change how you're learning…"
          }
          selected={selected}
        />
      )}
    </main>
  );
}

/** The moment between "material is in" and "teach me" — one button, because the learner has
 *  already said what they want by dropping the file. */
function SourcesAttached({ session }: { session: ReturnType<typeof useCanvasSession> }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-[30rem] text-center">
        <p className="text-[0.8125rem] text-(--ui-text-quaternary)">
          {session.canvas.sources.length} source{session.canvas.sources.length === 1 ? "" : "s"} attached
        </p>
        <h2 className="mt-2 text-[1.25rem] font-medium text-(--ui-text-primary)">{session.canvas.title}</h2>
        <button
          className="mt-8 rounded-lg bg-(--ui-text-primary) px-5 py-2.5 text-[0.875rem] font-medium text-(--ui-bg-editor) disabled:opacity-50"
          disabled={session.busy.kind !== null}
          // Wrapped, not passed by reference: `begin` now takes an optional topic, and handing
          // it straight to onClick would pass the click event in as the title.
          onClick={() => session.begin()}
          type="button"
        >
          Help me learn this
        </button>
      </div>
    </div>
  );
}
