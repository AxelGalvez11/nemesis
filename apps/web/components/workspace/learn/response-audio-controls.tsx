"use client";

// The playback controls for a response, in the row that was already there.
//
// 🔴🔴 NOT A PLAYER CARD, AND THAT IS THE OWNER'S FIRST CONSTRAINT: *"I do not want a large
// traditional audio-player card appearing under every Nemesis response… quiet, compact, only
// prominent while relevant."* So there is no border, no background, no toolbar and no second
// surface. The same 28px icon row that holds Copy simply grows a few more members while there is
// audio, and loses them again when there is not. The answer stays the thing on screen.
//
// 🔴 THE CONTROLS EXIST ONLY WHILE THEY MEAN SOMETHING. A pause button on an answer nobody is
// playing is this codebase's most-repeated defect — a control that does nothing — and five of them
// under every paragraph is that defect made into a design. Idle is one speaker glyph. Everything
// else fades in with the audio and fades out with it.
//
// 🔴 ONE BUTTON, TWO STATES, WHEREVER THE TWO ARE ONE INTENTION. Play and pause are the same
// button; Read-aloud and dismiss are not, because "start this" and "put this away" are different
// wishes and collapsing them would leave no way to stop listening without losing your place.
//
// Measured against ChatGPT's own read-aloud row (owner's reference): play/pause, a ten-second jump
// in each direction, a scrubbable progress bar, elapsed time, and a speed control that shows its
// value rather than an icon. Its styling is not copied — these are Nemesis's own control tokens,
// the same ones Copy has always used.

import { Codicon } from "@/components/desktop-ui/codicon";
import { formatClock, progressFraction, SEEK_STEP_SECONDS } from "@/lib/learn/playback";
import { cn } from "@/lib/utils";

import type { ResponseAudio } from "./use-response-audio";

/** The control shape every button in this row shares with Copy. */
const BUTTON =
  "flex h-[28px] shrink-0 items-center justify-center gap-1 rounded-[6px] px-1.5 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary) disabled:opacity-40 disabled:hover:bg-transparent";

/** What a failure says, in the learner's terms rather than the provider's. */
function failureCopy(failure: NonNullable<ResponseAudio["failure"]>): string {
  switch (failure) {
    case "not-signed-in":
      return "Sign in to hear this.";
    case "not-configured":
      return "Voice is not set up yet.";
    case "voice-quota":
      return "You have used this month's voice time.";
    case "playback-blocked":
      return "Press play to start the audio.";
    default:
      return "Audio unavailable.";
  }
}

/** A circular arrow with a number in it — the jump control every player draws this way. */
function JumpIcon({ back }: { back: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
      <g transform={back ? undefined : "translate(20 0) scale(-1 1)"}>
        <path
          d="M10 5.2a5.4 5.4 0 1 0 5.3 6.4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <path d="M10 2.6 7.2 5.2 10 7.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      </g>
      <text
        fill="currentColor"
        fontSize="7"
        fontWeight="600"
        textAnchor="middle"
        x="10"
        y="14.6"
      >
        10
      </text>
    </svg>
  );
}

export function ResponseAudioControls({ audio, text }: { audio: ResponseAudio; text: string }) {
  const open = audio.status !== "idle";
  const loading = audio.status === "loading";
  const fraction = progressFraction(audio.currentTime, audio.reach);

  return (
    <>
      {/* 🔴 START AND DISMISS, IN THE SAME PLACE, BECAUSE THE ROW MUST NOT REFLOW WHEN AUDIO
          ARRIVES. A control that changes what it does is honest here: with nothing playing it is
          "read this to me", and with audio on screen the only remaining wish for that position is
          "put this away". */}
      <button
        aria-label={open ? "Stop reading" : "Read aloud"}
        className={cn(BUTTON, open && "text-(--ui-text-secondary)")}
        onClick={() => (open ? audio.stop() : audio.start(text))}
        title={open ? "Stop reading" : "Read aloud"}
        type="button"
      >
        <Codicon name={open ? "close" : "unmute"} size="15px" spinning={false} />
      </button>

      {/* 🔴 THE TRANSITION IS ON THE WHOLE GROUP, NOT ON EACH BUTTON. Five things fading in
          separately reads as a page loading; one strip arriving reads as a control appearing.
          `grid-cols-[0fr]` → `[1fr]` is what lets width animate without a hard-coded pixel size,
          which is what keeps this from overflowing a narrow phone. */}
      <div
        aria-hidden={!open}
        className={cn(
          "grid min-w-0 flex-1 transition-[grid-template-columns,opacity] duration-200 ease-out",
          open ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
        )}
      >
        {/* 🔴 CAPPED, BECAUSE A HAIRLINE SEEK BAR SPANNING THE WHOLE ANSWER IS NOT QUIET. Left to
            `flex-1` alone the slider stretched the full width of the paragraph on a wide screen and
            threw the time and the speed to the far right, so the transport buttons and the readout
            they belong to stopped looking like one control. Capped, the whole thing stays a tight
            cluster under the start of the answer and still shrinks to a phone. */}
        <div className="flex min-w-0 max-w-[22rem] items-center gap-0.5 overflow-hidden">
          <button
            aria-label={audio.playing ? "Pause" : "Play"}
            className={cn(BUTTON, "text-(--ui-text-secondary)")}
            disabled={!open || loading}
            onClick={audio.toggle}
            tabIndex={open ? 0 : -1}
            title={audio.playing ? "Pause" : "Play"}
            type="button"
          >
            <Codicon name={loading ? "loading" : audio.playing ? "debug-pause" : "play"} size="15px" spinning={loading} />
          </button>

          <button
            aria-label={`Back ${SEEK_STEP_SECONDS} seconds`}
            className={BUTTON}
            disabled={!open || loading}
            onClick={() => audio.seekBy(-SEEK_STEP_SECONDS)}
            tabIndex={open ? 0 : -1}
            title={`Back ${SEEK_STEP_SECONDS} seconds`}
            type="button"
          >
            <JumpIcon back />
          </button>

          <button
            aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}
            className={BUTTON}
            disabled={!open || loading}
            onClick={() => audio.seekBy(SEEK_STEP_SECONDS)}
            tabIndex={open ? 0 : -1}
            title={`Forward ${SEEK_STEP_SECONDS} seconds`}
            type="button"
          >
            <JumpIcon back={false} />
          </button>

          {/* 🔴 A REAL RANGE INPUT RATHER THAN A DIV WITH POINTER HANDLERS. Keyboard seeking, screen
              reader position and touch dragging all come free and none of them survive a hand-rolled
              bar. It is styled down to a hairline; `accent-color` paints the filled half in the
              learner's own accent, in both themes, without a second element to keep in sync.

              🔴 IT SCRUBS THE PLAYABLE EXTENT, NOT THE FINAL DURATION. While bytes are still
              arriving the duration is not known yet, and seeking past what has arrived stalls the
              element rather than waiting. `audio.reach` is what can actually be heard right now. */}
          <input
            aria-label="Seek"
            aria-valuetext={`${formatClock(audio.currentTime)} of ${audio.reach > 0 ? formatClock(audio.reach) : "unknown"}`}
            className="mx-1 h-1 min-w-8 flex-1 cursor-pointer appearance-none rounded-full bg-(--ui-bg-quaternary) accent-[var(--theme-primary)] disabled:cursor-default"
            disabled={!open || audio.reach <= 0}
            max={1000}
            min={0}
            onChange={(event) => audio.scrub(Number(event.target.value) / 1000)}
            step={1}
            tabIndex={open ? 0 : -1}
            type="range"
            value={Math.round(fraction * 1000)}
          />

          <span className="shrink-0 px-1 text-[length:var(--canvas-text-meta)] tabular-nums text-(--ui-text-quaternary) max-[420px]:hidden">
            {formatClock(audio.currentTime)}
            {/* 🔴 THE TOTAL APPEARS ONLY ONCE IT IS TRUE. A running total that keeps growing as the
                download arrives is worse than no total: it reads as the answer getting longer. */}
            {audio.complete && audio.reach > 0 ? ` / ${formatClock(audio.reach)}` : ""}
          </span>

          {/* 🔴 THE SPEED SHOWS ITS VALUE RATHER THAN AN ICON — the rule this row already held. A
              gauge glyph says "speed exists"; "1.5×" says what it is set to, which is the only thing
              worth knowing at a glance, and it is why this needs no menu and no second click. */}
          <button
            aria-label={`Playback speed ${audio.rate}×. Press to change.`}
            className={cn(
              BUTTON,
              "text-[length:var(--canvas-text-meta)] tabular-nums",
              audio.rate !== 1 && "text-(--ui-text-secondary)",
            )}
            disabled={!open}
            onClick={audio.cycleRate}
            tabIndex={open ? 0 : -1}
            title={`Playback speed ${audio.rate}×`}
            type="button"
          >
            {audio.rate}×
          </button>
        </div>
      </div>

      {audio.failure && (
        // Named, not silent. A learner pressing play and hearing nothing needs to know the sound
        // failed rather than concluding the answer has none.
        <span className="shrink-0 pl-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          {failureCopy(audio.failure)}
        </span>
      )}
    </>
  );
}
