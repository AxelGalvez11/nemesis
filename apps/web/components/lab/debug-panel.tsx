"use client";

// What Nemesis thought, turn by turn — Nemesis Lab §10.
//
// 🔴 THE PANEL'S JOB IS TO SEPARATE SEVEN FAILURES THAT ALL LOOK THE SAME FROM OUTSIDE:
// bad extraction · bad retrieval · bad learner model · bad policy decision · bad model response ·
// bad judge · bad evidence write. Each turn therefore reads top to bottom as a chain, and every
// link says plainly whether it happened, so a missing link is visible rather than inferred.
//
// 🔴 AND IT NEVER PRINTS A NUMBER NOBODY MEASURED. "not reported" and "0" are different words here
// because they are different facts: a streamed call reports no tokens, which is not a free call;
// a turn with no evidence write is not a turn that wrote nothing.

import { useEffect, useMemo, useRef, useState } from "react";

import { subscribeLabTrace, type LabTraceEvent } from "@/lib/lab/trace";
import { foldTurns, type LabTurn } from "@/lib/lab/turns";

export function useLabTrace(): { events: LabTraceEvent[]; clear: () => void } {
  const [events, setEvents] = useState<LabTraceEvent[]>([]);
  useEffect(() => subscribeLabTrace((event) => setEvents((current) => [...current, event])), []);
  return { clear: () => setEvents([]), events };
}

export function DebugPanel({
  events,
  onClear,
  onSaveCase,
}: {
  events: readonly LabTraceEvent[];
  onClear: () => void;
  onSaveCase: (turn: LabTurn) => void;
}) {
  const turns = useMemo(() => foldTurns(events), [events]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-neutral-800 bg-neutral-950 text-neutral-200">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">What Nemesis thought</p>
        <span className="text-[11px] text-neutral-600">{turns.length} turn(s)</span>
        <button type="button" onClick={onClear} className="ml-auto text-[11px] text-neutral-500 underline">
          clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {turns.length === 0 ? (
          <p className="p-3 text-xs text-neutral-500">
            Nothing yet. As soon as the teaching controller decides something, every step of that turn
            appears here.
          </p>
        ) : null}
        {turns.map((turn) => (
          <TurnCard key={turn.index} turn={turn} onSaveCase={() => onSaveCase(turn)} />
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}

function TurnCard({ turn, onSaveCase }: { turn: LabTurn; onSaveCase: () => void }) {
  return (
    <div className="mb-2 rounded border border-neutral-800 bg-neutral-900 p-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">Turn {turn.index + 1}</span>
        <span className="text-neutral-500">{turn.strategy ?? "no controller ran"}</span>
        <button type="button" onClick={onSaveCase} className="ml-auto text-[11px] text-amber-400 underline">
          save as regression
        </button>
      </div>

      <Chain>
        <Link
          label="What it decided to do"
          value={turn.action ?? (turn.refusal ? `nothing: ${turn.refusal}` : "nothing")}
          bad={Boolean(turn.refusal)}
        />
        <Link label="About which objective" value={turn.objective ?? "none named"} />
        <Link label="What it asked" value={turn.question ?? "no question was judged in this turn"} />
        <Link
          label="How the answer was marked"
          value={turn.verdict ?? "nothing was marked"}
          bad={turn.verdict === "incorrect"}
        />
        <Link label="What kind of mistake" value={turn.errorType ?? "none named"} />
        <Link
          label="What was written down"
          value={
            turn.evidenceRows === null
              ? "no write was attempted"
              : turn.evidenceWritten === false
                ? `🔴 ${turn.evidenceRows} row(s) FAILED to save`
                : `${turn.evidenceRows} row(s) saved`
          }
          bad={turn.evidenceWritten === false}
        />
      </Chain>

      <p className="mt-2 text-[11px] text-neutral-500">
        {turn.modelCalls} model call(s) · {turn.totalMs}ms ·{" "}
        {turn.tokens
          ? `${turn.tokens.prompt} in / ${turn.tokens.completion} out (${turn.tokens.cacheHit} cached)`
          : "tokens not reported"}{" "}
        ·{" "}
        {turn.costUsd === null
          ? "cost not priced"
          : `$${turn.costUsd.toFixed(6)}`}
      </p>

      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-neutral-500">
          every step, in order ({turn.events.length})
        </summary>
        <div className="mt-1 space-y-1">
          {turn.events.map((event) => (
            <details key={event.seq} className="rounded border border-neutral-800 bg-neutral-950 p-1">
              <summary className="cursor-pointer text-[11px]">
                <span className="mr-2 rounded bg-neutral-800 px-1 text-[10px] uppercase text-neutral-400">
                  {event.kind}
                </span>
                <span className="text-neutral-300">{event.label}</span>
                {event.ms === undefined ? null : <span className="ml-2 text-neutral-600">{event.ms}ms</span>}
              </summary>
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] text-neutral-400">
                {safeJson(event.detail)}
              </pre>
            </details>
          ))}
        </div>
      </details>
    </div>
  );
}

function Chain({ children }: { children: React.ReactNode }) {
  return <dl className="mt-2 space-y-0.5">{children}</dl>;
}

function Link({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-neutral-500">{label}</dt>
      <dd className={bad ? "text-red-400" : "text-neutral-300"}>{value}</dd>
    </div>
  );
}

/** A trace payload can hold anything, including a cycle. Never let that break the panel. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch (cause) {
    return `(could not serialise this payload: ${cause instanceof Error ? cause.message : String(cause)})`;
  }
}
