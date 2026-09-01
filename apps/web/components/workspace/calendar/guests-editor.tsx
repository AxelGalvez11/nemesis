"use client";

// Guests, reminders and the guest permissions — stage 4 of Google parity.
//
// 🔴🔴 THE ONE RULE THIS FILE EXISTS TO ENFORCE: NEMESIS DOES NOT EMAIL ANYONE.
// Adding a guest to a Google event sends that person an invitation, immediately,
// with no further confirmation. Here, typing an address adds a line to a list and
// nothing else happens — the list is a record of who is invited, not an
// instruction to invite them. The notice under the field says so in as many
// words, because a student who has used Google Calendar has every reason to
// assume otherwise, and "I thought it had emailed my supervisor" is a mistake
// they would only discover by its absence.
//
// 🔴 AND REMINDERS DO NOT FIRE YET. Nemesis has no notification system. A
// reminder set here is stored, shown, and silent unless the event also lives in
// Google, where Google fires it. That is said on screen rather than left as a
// promise the product does not keep.

import { useState } from "react";

import type { EventAttendee, EventReminders } from "@/lib/workspace/calendar-model";
import { cn } from "@/lib/utils";

/** Deliberately loose: real addresses are stranger than any tidy pattern, and the
 *  cost of rejecting a good one is higher than the cost of storing a typo. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESPONSE_LABEL: Record<NonNullable<EventAttendee["responseStatus"]>, string> = {
  accepted: "Yes",
  declined: "No",
  needsAction: "No reply",
  tentative: "Maybe",
};

const FIELD = "h-8 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-xs text-foreground";

/** Google's three guest permissions. Undefined means "not said", which is what
 *  an event with no guests should record — see the form. */
export interface GuestPermissions {
  modify?: boolean;
  invite?: boolean;
  seeOthers?: boolean;
}

interface GuestsEditorProps {
  attendees: EventAttendee[];
  onAttendees: (next: EventAttendee[]) => void;
  reminders: EventReminders | undefined;
  onReminders: (next: EventReminders | undefined) => void;
  permissions: GuestPermissions;
  onPermissions: (next: GuestPermissions) => void;
}

export function GuestsEditor({
  attendees,
  onAttendees,
  onPermissions,
  onReminders,
  permissions,
  reminders,
}: GuestsEditorProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const overrides = reminders?.overrides ?? [];

  function addGuest() {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!LOOKS_LIKE_EMAIL.test(email)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (attendees.some((guest) => guest.email.toLowerCase() === email)) {
      setError("They're already on the list.");
      return;
    }
    setError(null);
    setDraft("");
    onAttendees([...attendees, { email }]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) p-2.5">
      <p className="text-xs font-medium text-(--ui-text-secondary)">Guests</p>

      {attendees.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attendees.map((guest) => (
            <li className="flex items-center gap-2 text-xs" key={guest.email}>
              <span className="min-w-0 flex-1 truncate">{guest.displayName || guest.email}</span>
              {/* Read-only, and it has to be: only the provider knows whether
                  somebody accepted. Showing an editable box here would let a
                  student record a "yes" their supervisor never gave. */}
              {guest.responseStatus && (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold",
                    guest.responseStatus === "accepted" && "bg-(--ui-green)/15 text-(--ui-green)",
                    guest.responseStatus === "declined" && "bg-(--ui-exam)/15 text-(--ui-exam)",
                    guest.responseStatus === "tentative" && "bg-(--ui-yellow)/15 text-(--ui-yellow)",
                    guest.responseStatus === "needsAction" && "bg-(--ui-bg-quaternary) text-(--ui-text-tertiary)",
                  )}
                >
                  {RESPONSE_LABEL[guest.responseStatus]}
                </span>
              )}
              <button
                aria-label={`Remove ${guest.email}`}
                className="shrink-0 rounded px-1 text-(--ui-text-tertiary) hover:text-foreground"
                onClick={() => onAttendees(attendees.filter((entry) => entry.email !== guest.email))}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1">
        <input
          aria-label="Add a guest by email"
          className={cn(FIELD, "min-w-0 flex-1")}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            addGuest();
          }}
          placeholder="Add a guest"
          value={draft}
        />
        <button
          className="shrink-0 rounded-lg border border-(--ui-stroke-secondary) px-2 text-xs font-medium hover:bg-(--ui-control-hover-background)"
          onClick={addGuest}
          type="button"
        >
          Add
        </button>
      </div>
      {error && <p className="text-[0.6875rem] text-(--ui-exam)">{error}</p>}
      <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
        Nemesis does not email anyone. This is a list of who is invited, kept with the event.
      </p>

      {attendees.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-(--ui-stroke-tertiary) pt-2">
          {([
            ["modify", "Guests can change this event"],
            ["invite", "Guests can invite others"],
            ["seeOthers", "Guests can see each other"],
          ] as const).map(([key, label]) => (
            <label className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)" key={key}>
              <input
                checked={permissions[key] ?? false}
                onChange={(e) => onPermissions({ ...permissions, [key]: e.target.checked })}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-(--ui-stroke-tertiary) pt-2">
        <p className="text-xs font-medium text-(--ui-text-secondary)">Reminders</p>
        {overrides.map((reminder, index) => (
          <div className="flex items-center gap-1" key={`${reminder.method}-${index}`}>
            <select
              aria-label="How to remind"
              className={FIELD}
              onChange={(e) => {
                const next = [...overrides];
                next[index] = { ...reminder, method: e.target.value as "popup" | "email" };
                onReminders({ ...reminders, overrides: next });
              }}
              value={reminder.method}
            >
              <option value="popup">Notification</option>
              <option value="email">Email</option>
            </select>
            <input
              aria-label="Minutes before"
              className={cn(FIELD, "w-20 tabular-nums")}
              max={40320}
              min={0}
              onChange={(e) => {
                const next = [...overrides];
                next[index] = { ...reminder, minutes: Math.max(0, Number(e.target.value) || 0) };
                onReminders({ ...reminders, overrides: next });
              }}
              type="number"
              value={reminder.minutes}
            />
            <span className="text-[0.6875rem] text-(--ui-text-tertiary)">min before</span>
            <button
              aria-label="Remove reminder"
              className="ml-auto rounded px-1 text-xs text-(--ui-text-tertiary) hover:text-foreground"
              onClick={() => {
                const next = overrides.filter((_, at) => at !== index);
                onReminders(next.length > 0 ? { ...reminders, overrides: next } : undefined);
              }}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
        {/* Five is Google's own cap, and more than five warnings about one thing
            is not a reminder, it is a nuisance. */}
        {overrides.length < 5 && (
          <button
            className="self-start rounded px-1 text-[0.6875rem] font-medium text-(--ui-text-secondary) hover:underline"
            onClick={() => onReminders({ ...reminders, overrides: [...overrides, { method: "popup", minutes: 30 }] })}
            type="button"
          >
            Add a reminder
          </button>
        )}
        {overrides.length > 0 && (
          <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
            Saved with the event. Nemesis cannot send notifications yet, so this only fires if the
            event is also in a calendar that can.
          </p>
        )}
      </div>
    </div>
  );
}
