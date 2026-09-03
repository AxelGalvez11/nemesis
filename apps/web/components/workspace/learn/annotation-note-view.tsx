"use client";

// What an annotation looks like above the message that carries it.
//
// 🔴🔴 THE PICTURE FIRST, THE COUNT UNDER IT, THE SENTENCE UNDER THAT. Measured off the owner's own
// screenshots of ChatGPT (2026-09-03): the cropped region sits as a small bordered card, the
// "1 annotation" chip sits between it and the message, and the learner's bubble is last. All three
// are right-aligned with the bubble, because they belong to what the learner said rather than to
// the document.
//
// 🔴 THE CROP IS SHOWN AT THE SIZE IT IS USEFUL, NOT THE SIZE IT IS. A region of a drug chart is a
// wide, short rectangle; a circled diagram is nearly square. Constraining the BOX and letting the
// picture fit inside it (`object-contain`) keeps both readable and stops a wide crop from setting
// the width of the whole turn.
//
// 🔴 IT DEGRADES TO THE CHIP ALONE. The thumbnail is an object URL over the crop and dies with the
// document, so a reopened conversation has the count but not the picture. That is deliberate: the
// crop is also attached to the canvas as a real file, so what was pointed at survives even when
// this preview does not, and a chip with no picture is honest where a broken image is not.

import { annotationLabel, hasAnnotations, type AnnotationNote } from "@/lib/learn/annotation-note";
import { Codicon } from "@/components/desktop-ui/codicon";

export function AnnotationNoteView({ notes }: { notes: readonly AnnotationNote[] }) {
  if (!hasAnnotations(notes)) return null;
  const shown = notes.filter((note) => note.thumbnail);

  return (
    <div className="flex flex-col items-end gap-[6px]" data-annotations={notes.length}>
      {shown.map((note, index) => (
        <div
          className="relative overflow-hidden rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)"
          key={note.thumbnail ?? index}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- an object URL over a crop this
              component made; there is no remote asset for the image loader to optimise. */}
          <img
            alt={note.where ? `The region you marked on ${note.where}` : "The region you marked"}
            className="block max-h-[132px] max-w-[240px] object-contain"
            src={note.thumbnail ?? ""}
          />
          {/* 🔴 THE NUMBER SITS ON THE PICTURE, which is what ties the chip below to the region
              above when there is more than one. The reference draws it the same way. */}
          <span className="absolute right-[6px] top-[6px] grid size-[18px] place-items-center rounded-full bg-(--ui-action) text-[length:var(--canvas-text-meta)] leading-none text-(--ui-action-glyph) tabular-nums">
            {index + 1}
          </span>
        </div>
      ))}
      <span className="inline-flex items-center gap-[6px] rounded-full border border-(--ui-stroke-tertiary) px-[10px] py-[4px] text-[length:var(--canvas-text-meta)] leading-[16px] text-(--ui-text-secondary)">
        <Codicon name="comment" size="12px" />
        {annotationLabel(notes.length)}
      </span>
    </div>
  );
}
