"use client";

// What to do when Google and Nemesis disagree about when something is.
//
// Owner 2026-09-02: "be able to resolve discrepancies with scheduling."
//
// 🔴🔴 THE STUDENT CHOOSES, EVERY TIME, ONE AT A TIME. There is no "resolve all" and there should
// not be: each of these is a real decision about when a real thing is happening, and a single
// button applying a heuristic to all of them is how somebody sits an exam on the wrong day. The
// sync already refuses to overwrite a locally-edited event on its own — this is where that refusal
// is handed back to the person who can actually settle it.
//
// 🔴 IT SAYS BOTH ANSWERS, NOT "THERE IS A CONFLICT". A student cannot choose between two versions
// they cannot see. Every row shows what each side says, side by side, in the same order every
// time, so the choice can be made from the banner without opening anything.

import { Button } from "@/components/desktop-ui/button";
import type { ProviderDisagreement } from "@/lib/workspace/calendar-conflicts";
import { AlertTriangle } from "@/lib/workspace/icons";

/** The field names, in words a student would use. */
const FIELD_LABEL: Record<string, string> = {
  date: "day",
  endTime: "end time",
  location: "place",
  time: "time",
  title: "name",
};

/** "nothing" rather than an empty gap: a blank side of a comparison reads as a rendering fault. */
const said = (value: string) => (value.trim() ? value : "nothing");

export interface SyncDisagreementsProps {
  found: readonly ProviderDisagreement[];
  /** Which row is mid-save, by external id, so its buttons can settle down. */
  busy?: string;
  onKeep: (row: ProviderDisagreement, keep: "nemesis" | "provider") => void;
  onDismiss: () => void;
}

export function SyncDisagreements({ found, busy, onKeep, onDismiss }: SyncDisagreementsProps) {
  if (found.length === 0) return null;
  return (
    <section
      aria-label="Scheduling differences"
      className="mx-5 mb-3 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) p-3 max-sm:mx-2"
    >
      <header className="flex items-center gap-2 pb-2">
        <AlertTriangle className="text-(--theme-primary)" size={16} />
        <h2 className="text-sm font-medium text-foreground">
          {found.length === 1
            ? "One event is different in Google"
            : `${found.length} events are different in Google`}
        </h2>
        <Button className="ml-auto rounded-full px-3" onClick={onDismiss} size="sm" variant="ghost">
          Later
        </Button>
      </header>
      <ul className="flex flex-col gap-2">
        {found.map((row) => (
          <li
            key={row.externalId}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-(--ui-bg-primary) px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{row.local.title}</p>
              <p className="text-xs text-muted-foreground">
                {row.fields.map((field) => (
                  <span className="mr-2 inline-block" key={field.field}>
                    {FIELD_LABEL[field.field] ?? field.field}: here {said(field.nemesis)}, Google{" "}
                    {said(field.provider)}
                  </span>
                ))}
              </p>
            </div>
            {/* 🔴 THE SUGGESTION IS A HINT ON A BUTTON, NEVER A PRE-MADE CHOICE. "unknown" is the
                common answer and it simply means neither button is marked. */}
            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="rounded-full px-3"
                disabled={busy === row.externalId}
                onClick={() => onKeep(row, "nemesis")}
                size="sm"
                variant={row.suggested === "nemesis" ? "default" : "outline"}
              >
                Keep mine
              </Button>
              <Button
                className="rounded-full px-3"
                disabled={busy === row.externalId}
                onClick={() => onKeep(row, "provider")}
                size="sm"
                variant={row.suggested === "provider" ? "default" : "outline"}
              >
                Use Google
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
