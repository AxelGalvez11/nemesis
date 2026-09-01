"use client";

// The player for whatever the canvas is reading aloud, in the top row beside the canvas's icons.
//
// 🔴🔴 IT MOVED OUT FROM UNDER THE ANSWER — owner, 2026-08-25: *"when user has voice to speak
// responses outloud could the popup be in the upper left either next to the upper left icons in
// canvas?"*, and then, shown both edges, they picked the right: beside the ⚏ and ⋯ they already use.
//
// The reason the move is right and not just a preference: the transport belongs to the SESSION, not
// to a paragraph. Under the answer it scrolled away the moment the learner read on, so pausing
// something still speaking meant scrolling back up to find the controls that started it. The top
// row is the one part of a canvas that does not move.
//
// 🔴 WHAT STAYS UNDER THE ANSWER IS THE START, AND ONLY THE START. "Read me THIS" is a fact about
// one answer and has to be reachable from it; "pause", "back ten", "half speed" are facts about
// what is playing and belong wherever the playing is. See `response-audio-controls.tsx`, which is
// now that one button.
//
// 🔴🔴 FIVE CONTROLS — owner spec, same message: *"dont add the 'audio time' just 'x' forward and
// back, the speed, and the pause"*. The clock in their reference screenshot is deliberately absent;
// this is a player, not a status display, and the same ruling took the scrubber out on 2026-08-23.
//
// 🔴 THE SPEED CONTROL IS BACK, AND THAT IS A REVERSAL, NOT AN OVERSIGHT. It was cut on 2026-08-23
// ("It just needs to have the forward and rewind and the pause and the x") when this row lived
// under every response and every glyph there competed with the paragraph. In the header it costs a
// paragraph nothing, and the owner asked for it by name. `reply-actions.test.ts` still forbids it
// UNDER an answer, which is where the original objection was.
//
// 🔴🔴 IT IS A PILL NOW, AND THAT REVERSES THIS FILE'S OWN ARGUMENT — owner, 2026-09-01, choosing
// between six designs drawn at real size in this exact row: *"give me D but remove the 'reading
// aloud'"*. What stood here said no card, no border, no pill, because a capsule would be the only
// boxed thing on a surface whose whole argument is that it has no toolbar. He looked at that
// argument rendered beside five alternatives and picked the boxed one; five loose glyphs in the
// chrome did not read as one object.
//
// 🔴 THE NO-CARD RULE IS NOT DEAD, IT IS SCOPED. It still governs the row UNDER an answer, which is
// where the 2026-08-22 complaint came from (*"quiet, compact, only prominent while relevant… the
// main content should remain the focus"*) and where `reply-actions.test.ts` still enforces it. That
// row is one glyph. This is the transport, it exists only while something is playing, and it is in
// the chrome rather than over the reading.
//
// 🔴 THE WORDS WENT WITH THE OWNER'S OWN EDIT. Design D carried "Reading aloud" beside the bars; he
// removed it in the same sentence that chose it. The bars now carry that meaning alone, which is
// why they had to become honest about what they do and do not know (see globals.css).

import { PLAYBACK_RATES, SEEK_STEP_SECONDS } from "@/lib/learn/playback";
import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import type { ResponseAudio } from "./use-response-audio";

/**
 * The header's own control shape, borrowed exactly.
 *
 * 🔴 36px, THE SAME AS ITS NEIGHBOURS, NOT THE 28px THE UNDER-ANSWER ROW USES. A control that is
 * two-thirds the height of the icon beside it reads as a different kind of thing that happens to be
 * nearby. These numbers come from `canvas-controls.tsx`, which took them off the reference in the
 * owner's browser on 2026-08-20: 36×36 boxes, 20×20 glyphs, radius 8.
 *
 * 🔴 `pointer-events-auto` IS LOAD-BEARING. The `<header>` in canvas-surface.tsx is
 * `pointer-events-none` so its dead label cannot swallow clicks meant for the document underneath;
 * anything in it that is meant to be pressed has to opt back in, one control at a time.
 */
const BUTTON =
  "pointer-events-auto flex h-[24px] shrink-0 items-center justify-center rounded-full px-1 "
  + "text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) "
  + "disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * A circular arrow with the jump length written inside it, the way every player draws this.
 *
 * 🔴 THE RING IS BIGGER AND THE NUMBER SMALLER THAN THE VERSION THIS REPLACES, AND THE REASON IS
 * VISIBLE AT THIS SIZE. The old one carried a 7px "10" inside a ring 10.8px across with the text
 * baseline pushed to y=14.6, so the digits sat ON the lower arc: at the 19px it lived at under an
 * answer that read as slightly heavy, and at 20px in the header it read as a smudge. A 13.2px ring
 * with a 6.4px numeral centred on the ring's own middle leaves clear space on every side.
 *
 * 🔴 `dominantBaseline="central"` RATHER THAN A HAND-PICKED `y`. A baseline offset guessed for one
 * font size is wrong at the next, which is exactly how the overlap above got in.
 */
function JumpIcon({ back, size = 20 }: { back: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 20 20" width={size}>
      <g transform={back ? undefined : "translate(20 0) scale(-1 1)"}>
        <path
          d="M10 4.6a6.6 6.6 0 1 0 6.4 8.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
        <path d="M10 1.9 7.1 4.6 10 7.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </g>
      <text
        dominantBaseline="central"
        fill="currentColor"
        fontSize="6.4"
        fontWeight="600"
        textAnchor="middle"
        x="10"
        y="11.4"
      >
        {SEEK_STEP_SECONDS}
      </text>
    </svg>
  );
}

/**
 * Four bars that move while sound is coming out.
 *
 * 🔴 THEY DO NOT READ THE AUDIO, AND THE COMMENT IN globals.css SAYS WHY THAT IS THE HONEST CHOICE
 * rather than the lazy one. What they claim is exactly what is true: something is playing, or it is
 * paused. `aria-hidden`, because the play/pause button beside them already says this to a screen
 * reader and a second announcement of the same fact is noise.
 */
function LiveBars({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden="true" className="audio-bars flex h-[14px] w-[17px] shrink-0 items-end justify-between" data-playing={playing}>
      {[9, 14, 7, 12].map((height, at) => (
        <span key={at} className="w-[2px] rounded-full bg-(--ui-action)" style={{ height: `${height}px` }} />
      ))}
    </span>
  );
}

/** What the speed control says right now. `1×` rather than `1.0×` — the rates are written the way
 *  a person says them, and the list they cycle is in `playback.ts`. */
function rateLabel(rate: number): string {
  return `${rate}×`;
}

export function CanvasAudioBar({ audio }: { audio: ResponseAudio }) {
  const open = audio.status !== "idle";
  const loading = audio.status === "loading";

  return (
    // 🔴 THE WHOLE GROUP ANIMATES, NOT THE BUTTONS. Five controls fading in one by one reads as a
    // page still loading; one strip arriving reads as a player appearing. `grid-cols-[0fr]` → `[1fr]`
    // is what lets the width animate without a hard-coded pixel size, so this cannot overflow the
    // row on a narrow window — and at `0fr` the group takes no width at all, so the canvas title
    // keeps every pixel it has today whenever nothing is playing.
    <div
      aria-hidden={!open}
      className={cn(
        "grid shrink-0 transition-[grid-template-columns,opacity] duration-200 ease-out",
        open ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
      )}
    >
      {/* 🔴 THE PILL. Height, radius, border and fill are design D as drawn and measured; the
          `min-w-0`/`overflow-hidden` pair survives from the collapsing wrapper above it, which is
          what lets the whole group animate to no width at all when nothing is playing. */}
      <div className="flex h-[34px] min-w-0 items-center gap-[7px] overflow-hidden rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) pl-[10px] pr-[5px]">
        <LiveBars playing={audio.playing} />
        <span className="h-[14px] w-px shrink-0 bg-(--ui-stroke-secondary)" />
        <button
          aria-label={audio.playing ? "Pause" : "Play"}
          className={cn(BUTTON, "w-[24px] text-(--ui-text-secondary)")}
          disabled={!open || loading}
          onClick={audio.toggle}
          tabIndex={open ? 0 : -1}
          title={audio.playing ? "Pause" : "Play"}
          type="button"
        >
          <Codicon name={loading ? "loading" : audio.playing ? "debug-pause" : "play"} size="14px" spinning={loading} />
        </button>

        {/* 🔴 A LABEL, NOT AN ICON, BECAUSE THE VALUE IS THE POINT. A speaker-with-a-dial glyph says
            "speed exists"; `1.25×` says what it is set to, which is the only question anyone has
            about a speed control they did not just press. Cycling wraps — see `nextPlaybackRate`. */}
        <button
          aria-label={`Playback speed, ${rateLabel(audio.rate)}`}
          // 🔴 A CANVAS TYPE TOKEN, NOT A PIXEL. §46.3 gives this surface five sizes and
          // `canvas-shell.test.ts` fails the build on any sixth; `--canvas-text-small` is the same
          // step the canvas title beside it uses, which is what makes the row read as one group.
          className={cn(BUTTON, "px-[6px] text-[length:var(--canvas-text-meta)] font-medium tabular-nums")}
          disabled={!open || loading}
          onClick={audio.cycleRate}
          tabIndex={open ? 0 : -1}
          // 🔴 NO DASH. `canvas-learner-copy.test.ts` fails on an em or en dash anywhere a learner
          // can read it, and a tooltip is somewhere a learner can read it.
          title={`Playback speed: ${PLAYBACK_RATES.map(rateLabel).join(", ")}`}
          type="button"
        >
          {rateLabel(audio.rate)}
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
          <JumpIcon back size={16} />
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
          <JumpIcon back={false} size={16} />
        </button>

        {/* 🔴 STOP, NOT PAUSE, AND THEY ARE DIFFERENT WISHES. Pause keeps your place; this puts the
            player away. Collapsing the two would leave no way to stop listening without losing it. */}
        <button
          aria-label="Stop reading"
          className={BUTTON}
          disabled={!open}
          onClick={() => audio.stop()}
          tabIndex={open ? 0 : -1}
          title="Stop reading"
          type="button"
        >
          <Codicon name="close" size="14px" />
        </button>
      </div>
    </div>
  );
}
