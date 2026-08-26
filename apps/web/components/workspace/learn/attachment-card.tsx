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

import { cn } from "@/lib/utils";

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
 * 🔴 THE ICON IS COLOURED BY TYPE, WHICH IS THE OTHER HALF OF READING AS A FILE. The reference's
 * PDF glyph measured `rgb(255, 59, 48)` — not its text colour, not its accent. A single grey glyph
 * for every format is what made ours read as a generic tag.
 *
 * Deliberately a short list with a neutral fallback rather than a table of every format: an
 * unlisted type gets the neutral document, which is correct rather than absent.
 */
const INK: Readonly<Record<string, string>> = {
  PDF: "#ff3b30",
  DOC: "#2b7cd3",
  DOCX: "#2b7cd3",
  XLS: "#1d9d61",
  XLSX: "#1d9d61",
  CSV: "#1d9d61",
  PPT: "#e06c34",
  PPTX: "#e06c34",
};

function DocGlyph({ tint }: { tint: string }) {
  // A page with a folded corner, drawn rather than pulled from the icon font, because the font's
  // `file` glyph is a 14px UI mark and this is a 24px object with a colour of its own.
  return (
    <svg aria-hidden="true" fill="none" height={24} viewBox="0 0 24 24" width={24}>
      <path
        d="M6 3.5h7.2L19 9.3V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z"
        stroke={tint}
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <path d="M13 3.6V9.5h5.9" stroke={tint} strokeLinejoin="round" strokeWidth={1.6} />
    </svg>
  );
}

export function AttachmentCard({
  className,
  name,
  onRemove,
}: {
  className?: string;
  name: string;
  /** Omitted for a file already sent — the reference's card has no × once it is committed. */
  onRemove?: () => void;
}) {
  const kind = fileKind(name);
  return (
    <div
      className={cn(
        // 🔴 EXPLICIT PIXELS, NEVER THE REM-BASED UTILITIES. `globals.css` sets the root font to
        // 112.5%, so `rounded-2xl` is 18px and `p-3` is 13.5px — every rem class renders 12.5%
        // larger than its name. That is what put the Library's pills at `0 18px` when the source
        // said `px-4`. Anywhere the reference states a pixel, this file states that pixel.
        "flex min-w-0 items-center gap-[12px] rounded-[16px] border border-(--ui-stroke-tertiary)",
        "bg-(--ui-bg-elevated) py-[12px] pl-[16px]",
        onRemove ? "pr-[8px]" : "pr-[16px]",
        className,
      )}
      title={name}
    >
      <span className="shrink-0">
        <DocGlyph tint={INK[kind] ?? "var(--ui-text-tertiary)"} />
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
        <span className="truncate text-[length:var(--canvas-text-meta)] leading-[16px] text-(--ui-text-secondary)">
          {kind}
        </span>
      </span>
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
