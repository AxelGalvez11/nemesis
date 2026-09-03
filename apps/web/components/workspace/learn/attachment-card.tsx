"use client";

// A file the learner has attached, drawn the way the reference draws one.
//
// 🔴 MEASURED, NOT COPIED FROM A SCREENSHOT (owner 2026-08-26: *"attaching docs to the chat doesnt
// match chatgpt either, please fix too"*, and earlier the same day: *"Don't just measure with
// vision. Make sure that you actually grab the numbers too."*). Read off a real file card on
// chatgpt.com while signed in, at a 1456px viewport:
//
//     card        480 x 62   radius 16px   border 1px rgba(0,0,0,0.10)   fill --bg-primary
//     padding     12px 16px  (plus a 56px right inset holding the trailing control)
//     icon        24 x 24    12px gap to the text
//     name        14px / 500 / line-height 20px / --text-primary
//     type line   12px / 400 / line-height 16px / --text-secondary
//     shadow      none
//
// 12 + 20 + 16 + 12 = 60, plus a hairline top and bottom, is where the 62 comes from — so the
// height is a consequence of the type sizes rather than a number to hard-code beside them.
//
// 🔴 WHAT WE HAD WAS A PILL, AND THAT IS THE WHOLE COMPLAINT. A ~30px fully-rounded chip with a
// 12px filename and no second line: the right information in the wrong object. A pill says "tag";
// a card with a type under the name says "file". The reference has never drawn an attachment as a
// pill, and side by side the difference is not subtle.
//
// 🔴 THE ONE NUMBER THAT IS OURS, STATED SO NOBODY MISTAKES IT FOR MEASUREMENT. The 480px width
// above is a card filling a message column, which is the only file card reachable without
// uploading a file into the owner's own ChatGPT account — something not worth doing to read a
// width. A composer attachment is sized to its content instead, capped so a long filename cannot
// push the send button off the row. Everything vertical, which is what the eye actually compares
// when the two sit side by side, is measured.

import { Codicon } from "@/components/desktop-ui/codicon";
import { fileMark } from "@/lib/learn/kind-mark";
import { cn } from "@/lib/utils";
import { ARC_CIRCUMFERENCE, dashOffsetFor } from "@/lib/workspace/read-progress";

/**
 * The type line under the name — "PDF", "DOCX", "PNG".
 *
 * 🔴 THE EXTENSION, UPPERCASED, AND NOTHING CLEVERER. The reference prints exactly this. A MIME
 * type ("application/vnd.openxmlformats-officedocument.wordprocessingml.document") is true and
 * unreadable, and a friendly name ("Word document") is a lookup table that goes stale the first
 * time somebody attaches a format nobody listed.
 */
export function fileKind(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "File";
  return name.slice(dot + 1).toUpperCase();
}

/**
 * 🔴🔴 THE MARK COMES FROM `kind-mark.ts`, AND THIS FILE NO LONGER HAS AN OPINION. Owner,
 * 2026-09-03: *"when I attach documents it should also have the icon for like PowerPoint slide or
 * DOCX, PDF etc… everything should have an icon, that's attached in the chat composer."*
 *
 * 🔴 WHAT WAS HERE WAS A THIRD VOCABULARY, AND IT DREW ONE SHAPE. This file kept its own eight-row
 * hex table and one hand-drawn page-with-a-folded-corner, tinted — so a deck, a spreadsheet and a
 * PDF were the same outline in three colours, and the colours were literals that agreed with
 * nothing. Meanwhile `artifact-card.tsx` had a glyph and a token per kind for the files a canvas
 * MAKES, and the sources panel had just been moved onto the same table. A file that goes in and a
 * file that comes out are the same kind of object; three tables for one question is how they stop
 * looking like it.
 *
 * So the composer reads `fileMark`, exactly as the sources panel and the artifact card do: one
 * glyph per kind, one token per kind, and an unrecognised extension gets the quiet grey page
 * rather than a confident wrong colour.
 */

/**
 * A filling arc where the file's own glyph used to sit.
 *
 * 🔴🔴 IT FILLS, IT DOES NOT SPIN, AND EVERY STOP IS A COMPLETED FACT. Owner, 2026-09-01: *"remove
 * the attachment icon and replace with a circular progress bar that doesnt spin but just does the
 * progress indicator."* This replaces the turning ring shipped in #1027, whose own comment argued
 * there was no fraction to draw. That argument was right about `extractFile` as a black box and
 * wrong about `extractFile` as a sequence: it authorises, it uploads, and it gets an answer, and a
 * browser can see each of those finish. `lib/workspace/read-progress.ts` owns the weights and its
 * test refuses a clock, which is the part that keeps this honest.
 *
 * 🔴 TWELVE O'CLOCK NEVER MOVES. The `-rotate-90` is on the whole svg and nothing inside it turns,
 * so the sweep of the ink IS the reading. Rotating any part of this would put the spinner back.
 *
 * 🔴 `stroke-dashoffset`, NOT A TWO-VALUE `stroke-dasharray`. Only the offset animates the same way
 * across engines; a dasharray pair snaps in some browsers and glides in others, so the arc would
 * jump between stops for some learners and not others.
 *
 * 🔴 IT REPLACES THE GLYPH RATHER THAN WRAPPING IT, which is a REVERSAL of the rule #1027 shipped
 * under ("the ring replaces nothing, it wraps"). What is lost is real and worth writing down: the
 * card stops saying which KIND of file is being read at the moment somebody is staring at it, so
 * five files dropped at once become five identical circles told apart only by a truncated name.
 * The owner made that trade deliberately; the glyph returns the instant the read lands.
 */
function ReadingArc({ progress }: { progress: number }) {
  return (
    <span aria-hidden="true" className="relative flex h-[34px] w-[34px] items-center justify-center">
      <svg className="-rotate-90" fill="none" height={34} viewBox="0 0 34 34" width={34}>
        <circle cx={17} cy={17} r={15} stroke="var(--ui-stroke-secondary)" strokeWidth={2.5} />
        <circle
          cx={17}
          cy={17}
          r={15}
          stroke="var(--ui-action)"
          // 🔴 THE TRANSITION IS WHAT MAKES A THREE-STOP ARC READ AS PROGRESS RATHER THAN AS THREE
          // JUMPS. Long enough to be seen travelling, short enough not to still be moving when the
          // next stop lands.
          style={{ strokeDashoffset: dashOffsetFor(progress), transition: "stroke-dashoffset 420ms ease-out" }}
          strokeDasharray={ARC_CIRCUMFERENCE}
          strokeLinecap="round"
          strokeWidth={2.5}
        />
      </svg>
    </span>
  );
}

/**
 * Where this file has got to.
 *
 * 🔴 THE ARC CARRIES IT NOW, AND THE SECOND LINE IS EMPTY WHILE IT READS. This note used to argue
 * the opposite ("the type line carries it, rather than a spinner or a bar... a bar would have to
 * invent a percentage nobody measured"), which held only while the read was a single opaque call.
 * It is a sequence with three observable ends, so the arc draws those and the caption is gone. The
 * line returns to the file's type the moment the read lands, so the card at rest is exactly the
 * card that was measured off the reference.
 */
export type AttachmentState = "reading" | "ready" | "failed";

export function AttachmentCard({
  className,
  name,
  onRemove,
  onRetry,
  progress = 0,
  state = "ready",
}: {
  /**
   * How much of the arc to draw, 0 to 1. Ignored unless `state` is "reading".
   *
   * 🔴 THE CALLER OWNS IT BECAUSE THE CALLER OWNS THE READ. This component has no idea a file is
   * being uploaded; `extractFile` reports its steps to whoever started it, and that surface holds
   * the number. Defaulting to 0 means a caller that has not wired it yet draws an empty circle,
   * which is honest, rather than a full one.
   */
  progress?: number;
  className?: string;
  name: string;
  /** Omitted for a file already sent — the reference's card has no × once it is committed. */
  onRemove?: () => void;
  /**
   * Read it again.
   *
   * 🔴 A FAILED CARD HOLDS THE SEND, so it must carry its own way out. Most read failures are
   * transient (a dropped connection mid-upload), which makes "try again" the likeliest correct
   * action and the × the second one. Shown only on `failed`: a retry beside a file that read
   * perfectly would invite a second parse of something already done.
   */
  onRetry?: () => void;
  state?: AttachmentState;
}) {
  const kind = fileKind(name);
  // 🔴 THE NAME IS ALL THERE IS HERE, AND THAT IS ENOUGH. A composer attachment is a `File` the
  // learner just chose, so its extension is always present — the second argument exists for
  // sources restored from canvases whose titles were prettified before 2026-09-03.
  const mark = fileMark(name);
  // 🔴 THE NAME OF THE STEP, NOT AN ADJECTIVE ABOUT THE FILE. "Reading…" is what Nemesis is doing;
  // "Couldn't read" says the one thing the learner can act on (remove it, or send anyway and ask
  // about the rest). Neither line is a status code dressed up as English.
  // 🔴 EMPTY WHILE READING, and the two other states are unchanged. A failure still says so in
  // words, because a red arc frozen part-way is a symptom rather than an explanation.
  const line = state === "reading" ? "" : state === "failed" ? "Couldn't read" : kind;
  return (
    <div
      className={cn(
        // 🔴 EXPLICIT PIXELS, NEVER THE REM-BASED UTILITIES. `globals.css` sets the root font to
        // 112.5%, so `rounded-2xl` is 18px and `p-3` is 13.5px — every rem class renders 12.5%
        // larger than its name. That is what put the Library's pills at `0 18px` when the source
        // said `px-4`. Anywhere the reference states a pixel, this file states that pixel.
        "flex min-w-0 items-center gap-[12px] rounded-[16px] border border-(--ui-stroke-tertiary)",
        "bg-(--ui-bg-elevated) py-[12px] pl-[16px]",
        // 🔴🔴 THE SWEEP IS WHY A PAUSED ARC IS NOT A STUCK ARC. The arc only moves when a step
        // finishes, so it holds still through the longest part of a read; a card that were also
        // still would read as a hang. The sweep is the app's own rewriting gesture, so waiting in
        // the composer looks like waiting everywhere else in the product.
        state === "reading" && "reading-sweep",
        onRemove ? "pr-[8px]" : "pr-[16px]",
        className,
      )}
      title={name}
    >
      {/* 🔴 THE ARC REPLACES THE GLYPH, which reverses what #1027 shipped under ("the ring replaces
          nothing, it wraps"). The cost that comment named is real and is now paid on purpose: the
          card stops saying which KIND of file is being read while it reads. The owner chose the
          trade; the glyph returns the instant the read lands. */}
      <span className="flex size-[24px] shrink-0 items-center justify-center">
        {state === "reading" ? (
          <ReadingArc progress={progress} />
        ) : (
          // 🔴 22px INSIDE A 24px BOX. The reference's mark measures 24 square; a codicon is a font
          // glyph with its own bearing, so setting the font size to 24 draws a mark that overflows
          // the box the card's 12px gap is measured from. 22 lands the drawn shape on the
          // reference's 24, which is what the eye compares.
          <Codicon name={mark.icon} size="22px" style={{ color: `var(${mark.tint})` }} />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        {/* 🔴 THE SCALE'S OWN STEPS, WHICH HAPPEN TO BE THE REFERENCE'S NUMBERS EXACTLY.
            `--canvas-text-small` is 14px and `--canvas-text-meta` is 12px (desktop-ui.css), which
            is what the reference measured for the name and the type line — so there is no tension
            here between matching it and §46.3's rule that the Canvas has five declared sizes and no
            local ones. A bare pixel literal would have been a sixth step nobody declared, and
            `canvas-shell.test.ts` is right to refuse it — it reddened on the first version of this
            file, and then again on this very comment, because a JSX block comment is not one of the
            `//` lines that guard strips. Do not name the banned form in prose here.
            🔴 THE LINE HEIGHTS STAY EXPLICIT, and they are the reason the card is 62px rather than
            65: 14px text draws a 22.4px line box by default here, so 12 + 22.4 + 16 + 12 would
            overshoot. 20 and 16 are measured off the reference. */}
        <span className="truncate text-[length:var(--canvas-text-small)] font-medium leading-[20px] text-(--ui-text-primary)">
          {name}
        </span>
        {/* 🔴 NOTHING UNDER THE NAME WHILE IT READS (owner 2026-09-01: *"remove the 'reading
            text'"*). The arc says what the word used to, and a caption that only ever reads
            "Reading…" is the least informative line on the card. The name centres itself in the
            card's height because it is now the only child. */}
        {line ? (
          <span
            className={cn(
              "truncate text-[length:var(--canvas-text-meta)] leading-[16px]",
              state === "failed" ? "text-(--destructive)" : "text-(--ui-text-secondary)",
            )}
          >
            {line}
          </span>
        ) : null}
      </span>
      {onRetry && state === "failed" ? (
        <button
          aria-label={`Try reading ${name} again`}
          className={cn(
            "ml-[4px] shrink-0 rounded-[8px] px-[8px] py-[4px]",
            "text-[length:var(--canvas-text-meta)] font-medium leading-[16px] text-(--ui-text-primary)",
            "transition-colors hover:bg-(--ui-bg-tertiary)",
          )}
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      ) : null}
      {onRemove ? (
        <button
          aria-label={`Remove ${name}`}
          className="ml-[4px] flex size-[28px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={onRemove}
          title="Remove"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height={14} viewBox="0 0 14 14" width={14}>
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth={1.6} />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/**
 * The row the cards sit in.
 *
 * 🔴 INSIDE THE COMPOSER, ABOVE THE INPUT — which is where the reference puts a staged file, and
 * what the owner asked for on 2026-08-20: *"i dont want the attachments to be above the chat
 * composer at all"*. They had drifted back out to a detached row floating over the box, which is
 * both the thing that was objected to and the thing that does not match.
 *
 * 🔴 IT SCROLLS SIDEWAYS RATHER THAN WRAPPING. Cards are 62px tall; three of them wrapped would
 * push the input row most of the way down the surface and move the send button while the learner
 * was reaching for it. The reference keeps them on one line for the same reason.
 */
export function AttachmentRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-full items-center gap-[8px] overflow-x-auto px-[8px] pb-[4px] pt-[12px]">
      {children}
    </div>
  );
}
