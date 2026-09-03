"use client";

// DEV-ONLY PREVIEW — what the composer shows while it is reading a document.
//
// Owner, 2026-09-01, first: *"when the chat composer is reading and parsing documents there should
// be an animation or like a loading circular bar showing progress in processing"*. Then, having
// seen the turning ring that shipped: *"remove the attachment icon and replace with a circular
// progress bar that doesnt spin but just does the progress indicator, also make sure the send
// button for chat composer is just inactivated"*.
//
// Both halves are the REAL components: the attachment card the front door stages files into, and
// the send button it puts on the pill. The only thing scripted is the state they are handed.

import { AttachmentCard } from "@/components/workspace/learn/attachment-card";
import { ComposerSend } from "@/components/workspace/learn/composer-controls";

export default function ReadingStatePreview() {
  return (
    <main data-workspace className="min-h-screen bg-(--ui-bg) px-[56px] py-[44px] text-(--ui-text-primary)">
      <h1 className="text-[15px] font-semibold">While a document is being read</h1>
      <p className="mb-[32px] mt-[6px] max-w-[620px] text-[12.5px] leading-[1.6] text-(--ui-text-tertiary)">
        The arc fills from twelve o&rsquo;clock and nothing on it turns. It moves only when a step of
        the read has genuinely finished — the key resolved, the bytes uploaded, the extractor
        answered — so it holds still through the long middle, and the sweep across the card is what
        says the work is still going.
      </p>

      <div className="flex max-w-[560px] flex-col gap-[14px]">
        <AttachmentCard name="Lecture 7 — Enzyme kinetics.pdf" onRemove={() => undefined} progress={0.1} state="reading" />
        <AttachmentCard name="Seminar notes.docx" onRemove={() => undefined} progress={0.6} state="reading" />
        <AttachmentCard name="Problem set 3.pdf" onRemove={() => undefined} state="ready" />
        <AttachmentCard name="Scan of the whiteboard.heic" onRemove={() => undefined} onRetry={() => undefined} state="failed" />
      </div>

      <h2 className="mb-[12px] mt-[40px] text-[13px] font-semibold">One mark per kind of file</h2>
      <p className="mb-[16px] max-w-[620px] text-[12.5px] leading-[1.6] text-(--ui-text-tertiary)">
        Owner, 2026-09-03: <em>&ldquo;when I attach documents it should also have the icon for like
        PowerPoint slide or DOCX, PDF etc.&rdquo;</em> The glyph and the colour are
        <code> kind-mark.ts</code>&rsquo;s, the same pair the sources panel and the artifact card
        draw, so a file that goes in and a file that comes out look like the same kind of thing.
      </p>
      <div className="flex max-w-[560px] flex-col gap-[14px]">
        {[
          "Lecture 7 — Enzyme kinetics.pdf",
          "Seminar notes.docx",
          "Week 4 lecture.pptx",
          "Grade book.xlsx",
          "Readings.csv",
          "Scan of the whiteboard.png",
          "Reading list.md",
          "Ward round.m4a",
          "archive.zip",
        ].map((name) => (
          <AttachmentCard key={name} name={name} onRemove={() => undefined} state="ready" />
        ))}
      </div>

      <h2 className="mb-[12px] mt-[40px] text-[13px] font-semibold">The arc, at each stop</h2>
      <div className="flex max-w-[560px] flex-col gap-[14px]">
        {[["queued", 0], ["authorised", 0.1], ["uploaded", 0.6], ["read", 1]].map(([label, at]) => (
          <AttachmentCard key={label as string} name={`${label as string}.pdf`} progress={at as number} state="reading" />
        ))}
      </div>

      <h2 className="mb-[12px] mt-[40px] text-[13px] font-semibold">The send button, in each state</h2>
      <div className="flex items-center gap-[26px]">
        {[
          ["reading", { busy: false, disabled: true }],
          ["ready to send", { busy: false, disabled: false }],
          ["nothing typed", { busy: false, disabled: true }],
        ].map(([label, props]) => (
          <div key={label as string} className="flex flex-col items-center gap-[8px]">
            <ComposerSend
              busy={(props as { busy: boolean }).busy}
              disabled={(props as { disabled: boolean }).disabled}
              label="Start"
              onClick={() => undefined}
            />
            <span className="text-[11.5px] text-(--ui-text-quaternary)">{label as string}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
