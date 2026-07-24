// ActivityStrip — the chat "thinking preview" (shell spec §B5). It replaces the
// old anonymous "Thinking" shimmer with an honest, specific line: WHAT the turn
// is doing right now (routing → searching → reading → thinking) plus an elapsed
// timer, and — when the engine streams its own working-out — a second dim line
// showing that live reasoning. This brings web up to the phone's honesty
// (apps/mobile/src/components/ThinkingLine.tsx); the wording rules are shared
// through the parity ports lib/workspace/{thinking-phase,reasoning-preview}.ts,
// so both surfaces say the same kinds of things.
//
// Nothing here is invented. The phase line comes straight from real pipeline
// steps (see thinking-phase.ts), and the reasoning line is the model's own
// stream — if a turn has neither searching nor reasoning, the strip simply
// shows the plain phase line, which is the normal quiet case.

import { phaseLabel, settledLabel, type ThinkingPhase } from "@/lib/workspace/thinking-phase";

interface ActivityStripProps {
  placement: "live" | "header";
  seconds: number | null;
  /** What the in-flight turn is doing now (live placement only). */
  phase?: ThinkingPhase;
  /** The already-trimmed glimpse of the model's working-out (live only) — NOT
   *  the raw stream. The caller buffers and computes this a few times a second
   *  (reasoning arrives far too fast to render chunk by chunk). Empty is normal:
   *  Instant turns and tool routes carry no reasoning. */
  reasoning?: string;
}

export function ActivityStrip({ placement, seconds, phase, reasoning }: ActivityStripProps) {
  if (placement === "live") {
    const label = phaseLabel(phase ?? { kind: "routing" });
    // The gate that makes the whole block vanish the instant the first answer
    // word lands: `pending` stays true through the entire answer stream, but
    // the "writing" phase returns an empty label. Without this, an empty row
    // and a ticking timer would linger under the streaming prose.
    if (!label) return null;
    const thought = reasoning?.trim() ?? "";

    return (
      <div
        aria-live="polite"
        className="mt-1.5 mb-1 flex min-w-0 max-w-full flex-col gap-0.5"
        data-slot="aui_activity-phrase"
        role="status"
      >
        <div className="thinking-status">
          <span aria-hidden className="dither-square" />
          {/* The continuous shimmer is what reads as "live", so a phase change
              swaps the text in place under it — no per-change transition needed
              (phases change only a handful of times a turn). */}
          <span className="shimmer-text">{label}</span>
          {seconds !== null && <span className="think-secs">{seconds}s</span>}
        </div>
        {thought && (
          // Dimmer and unanimated on purpose: this text changes every few
          // hundred milliseconds, and a shimmer or fade per change would be
          // permanent motion under the reader's eye rather than a transition.
          // Two-line clamp so a long thought never grows the row unboundedly.
          <p className="line-clamp-2 pl-5 text-[length:var(--conversation-caption-font-size)] leading-snug text-[color:var(--text-3)] opacity-80">
            {thought}
          </p>
        )}
      </div>
    );
  }

  const caption = settledLabel(seconds);
  if (!caption) return null;

  return (
    <p className="mb-1 flex items-center gap-1 text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">
      {caption}
    </p>
  );
}
