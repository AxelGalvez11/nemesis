"use client";

// DEV-ONLY PREVIEW — the confirmation card, both of its shapes, with no session.
//
// 🔴 IT EXISTS BECAUSE THIS IS THE ONE PIECE OF CANVAS UI THAT CANNOT BE SEEN ANY OTHER WAY. The
// card only appears when a real tool call comes back held, which needs a signed-in learner, a
// connected app or a real calendar row, and a model that decided to touch one. That is not a thing
// to be looking at for the first time in production — it is the control standing between a model's
// intention and somebody's mailbox, and how easy it is to click past is the whole design.
//
// The same harness convention `/dev-preview/visual-cards` set: mount the REAL component against
// hand-written fixtures, so what is checked here is the shipped card and not a drawing of it.

import { useState } from "react";

import { ConfirmCard } from "@/components/workspace/learn/confirm-card";
import type { PendingConfirmation } from "@/lib/learn/canvas-tools";

const CASES: readonly { label: string; pending: PendingConfirmation }[] = [
  {
    label: "A calendar event, going for good",
    pending: {
      kind: "delete",
      pending: {
        args: { event_id: "evt_1" },
        recoverable: false,
        target: "the exam “Physiology midterm” on 12 May",
        tool: "delete_calendar_event",
      },
    },
  },
  {
    label: "An email, not sent yet",
    pending: {
      kind: "action",
      pending: {
        action: "GMAIL_SEND_EMAIL",
        app: "gmail",
        arguments: { body: "…", subject: "Extension request", to: "s.okafor@example.ac.uk" },
        summary: "send email: s.okafor@example.ac.uk",
      },
    },
  },
  {
    label: "An email to a great many people",
    pending: {
      kind: "action",
      pending: {
        action: "GMAIL_SEND_EMAIL",
        app: "gmail",
        arguments: { to: ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com"] },
        summary: "send email: a@example.com, b@example.com, c@example.com and 2 more",
      },
    },
  },
];

export default function ConfirmCardPreview() {
  const [answered, setAnswered] = useState<Record<number, string>>({});

  return (
    // 🔴 `data-workspace` IS LOAD-BEARING IN EVERY DEV PREVIEW, AND ITS ABSENCE IS NOT SUBTLE.
    // globals.css carries `button:where(:not([data-workspace] *)) { background: var(--acid) }` for
    // the marketing pages, so a harness without the stamp paints every button in this card a solid
    // slab — including "Not now", which is meant to be the quiet one. Measured here on 2026-08-25
    // for the third time in this repo.
    <div className="mx-auto flex max-w-[560px] flex-col gap-8 bg-(--ui-bg-editor) p-8" data-workspace>
      {CASES.map((row, i) => (
        <section className="flex flex-col gap-2" key={row.label}>
          <p className="m-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{row.label}</p>
          <p className="m-0 text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">
            Right, I can do that. Have a look before I go ahead.
          </p>
          <ConfirmCard
            onAnswer={(approve) => setAnswered((current) => ({ ...current, [i]: approve ? "ran" : "declined" }))}
            pending={row.pending}
          />
          {answered[i] && (
            <p className="m-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
              {answered[i] === "ran" ? "Approved (nothing really ran here)." : "Declined."}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
