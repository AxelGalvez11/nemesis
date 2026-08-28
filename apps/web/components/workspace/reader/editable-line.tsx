"use client";

// One line of a document, changed in place.
//
// 🔴🔴 DOUBLE-CLICK, NOT CLICK. A single click inside a document is how you start SELECTING text,
// and selecting is what the five reader actions run on. Turning a line into a field on one click
// would take the highlight gesture away from every line on the slide to give an edit gesture to
// one.
//
// 🔴 THE FIELD IS THE LINE, not a dialog beside it. What the learner is judging is whether the new
// words fit where the old ones were, which is exactly the thing Nemesis cannot compute for them
// (PowerPoint owns text-box layout — see `ooxml-edit.ts`). Editing anywhere else hides the only
// evidence they have.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function EditableLine({
  children,
  className,
  editable,
  onCommit,
  style,
  text,
}: {
  /** What the line looks like when it is not being edited — usually a search-painted span. */
  children: React.ReactNode;
  className?: string;
  /** False for a line with nothing replaceable in it: a table row, a slide-number field. */
  editable: boolean;
  onCommit: (text: string) => void;
  style?: React.CSSProperties;
  text: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // Grows with what is typed. A field that scrolls internally hides the very thing being judged:
  // whether the new words still fit on the line.
  useLayoutEffect(() => {
    const element = field.current;
    if (draft === null || !element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (draft === null) return;
    field.current?.focus();
    field.current?.select();
    // Only once, when the field opens: re-selecting on every keystroke would eat the typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft === null]);

  if (draft === null) {
    return (
      <span
        className={cn(className, editable && "cursor-text rounded-[3px] hover:bg-black/[0.04]")}
        onDoubleClick={
          editable
            ? () => {
                // 🔴 A DOUBLE-CLICK SELECTS THE WORD UNDER IT, and a selection inside the document
                // is what raises the five reader actions. Without this the learner gets a field to
                // type in AND a floating "Ask about this" bar over the line they are editing.
                window.getSelection()?.removeAllRanges();
                setDraft(text);
              }
            : undefined
        }
        style={style}
        title={editable ? "Double-click to edit this line" : undefined}
      >
        {children}
      </span>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    // An unchanged line is not an edit: it must not repack the file, bump the counter, or turn a
    // read into "you have unsaved changes".
    if (next && next !== text.trim()) onCommit(next);
  };

  return (
    <textarea
      className={cn(
        className,
        "w-full resize-none overflow-hidden rounded-[3px] bg-white/70 outline-none ring-1 ring-(--ui-action)",
      )}
      data-testid="reader-line-editor"
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // Enter commits; a line on a slide is a line, and a newline inside it would be written into
        // the run as a character rather than as the line break PowerPoint understands.
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(null);
        }
        // 🔴 THE READER IS LISTENING FOR ESCAPE TOO, and the docked panel closes on it. Without this
        // the learner presses Escape to abandon a typo and the whole document shuts.
        event.stopPropagation();
      }}
      ref={field}
      rows={1}
      style={style}
      value={draft}
    />
  );
}
