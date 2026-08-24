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
// 🔴🔴 FOUR CONTROLS, LARGER, AND NOTHING ELSE — owner spec, 2026-08-23, looking at the full row:
// *"the playbar looks a bit weird… make it look bigger… the blue circle that's supposed to
// represent where the audio is at, I want you to remove that… It just needs to have the forward
// and rewind and the pause and the x. It doesn't really need the timer in there."* The first
// version measured ChatGPT's row and carried its whole transport — scrubber, elapsed clock, a
// cycling speed label — and the owner's read of the result is that it was clutter. So the bar is
// now exactly the four wishes a listener has (stop, pause/resume, back ten, forward ten), sized
// up from the 28px Copy row to read as a control rather than a footnote. Position is still
// audible — the jumps work — it is simply not DRAWN, which is the difference between a player
// and a status display. Do not quietly reintroduce the scrubber, the clock or the speed control;
// reply-actions.test.ts forbids each by name.

import { Codicon } from "@/components/desktop-ui/codicon";
import { SEEK_STEP_SECONDS } from "@/lib/learn/playback";
import { cn } from "@/lib/utils";

import type { ResponseAudio } from "./use-response-audio";

/** The control shape this row's buttons share. Same family as Copy's 28px row, sized up — the
 *  owner asked for a bar that reads as a control ("make it look bigger"), and 34px is one step up
 *  that still sits quietly under a paragraph. */
const BUTTON =
  "flex h-[34px] shrink-0 items-center justify-center gap-1 rounded-[8px] px-2 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary) disabled:opacity-40 disabled:hover:bg-transparent";

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
    <svg aria-hidden="true" fill="none" height="19" viewBox="0 0 20 20" width="19">
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
        <Codicon name={open ? "close" : "unmute"} size="18px" spinning={false} />
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
        {/* The whole strip is three buttons now, so it needs no width cap — the owner's four-
            control ruling above is what keeps it from ever growing back into a bar that would. */}
        <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
          <button
            aria-label={audio.playing ? "Pause" : "Play"}
            className={cn(BUTTON, "text-(--ui-text-secondary)")}
            disabled={!open || loading}
            onClick={audio.toggle}
            tabIndex={open ? 0 : -1}
            title={audio.playing ? "Pause" : "Play"}
            type="button"
          >
            <Codicon name={loading ? "loading" : audio.playing ? "debug-pause" : "play"} size="18px" spinning={loading} />
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
