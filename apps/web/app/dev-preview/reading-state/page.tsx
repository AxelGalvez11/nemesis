"use client";

// DEV-ONLY PREVIEW — what the composer shows while it is reading a document.
//
// Owner, 2026-09-01: *"when the chat composer is reading and parsing documents there should be an
// animation or like a loading circular bar showing progress in processing"*.
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
        The ring turns while the parser is working. It does not fill up, because the parser reports
        nothing until it finishes: an arc creeping toward full would be a number about your document
        that nobody measured.
      </p>

      <div className="flex max-w-[560px] flex-col gap-[14px]">
        <AttachmentCard name="Lecture 7 — Enzyme kinetics.pdf" onRemove={() => undefined} state="reading" />
        <AttachmentCard name="Seminar notes.docx" onRemove={() => undefined} state="reading" />
        <AttachmentCard name="Problem set 3.pdf" onRemove={() => undefined} state="ready" />
        <AttachmentCard name="Scan of the whiteboard.heic" onRemove={() => undefined} onRetry={() => undefined} state="failed" />
      </div>

      <h2 className="mb-[12px] mt-[40px] text-[13px] font-semibold">The send button, in each state</h2>
      <div className="flex items-center gap-[26px]">
        {[
          ["reading", { busy: true, disabled: false }],
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
