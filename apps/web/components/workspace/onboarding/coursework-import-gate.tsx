"use client";

// Bringing a portal reading in, for a student who is past their first day.
//
// THE HOLE THIS FILLS. Importing only existed inside the first-run flow, so a
// student who had already finished onboarding could scan their Blackboard, see
// "Read 9 courses", and then find no way at all to get them into Nemesis. The
// extension holds a reading; nothing was listening for it.
//
// Now anywhere in the workspace: if the extension is holding courses, this
// offers to bring them in. It is a card, not a takeover — it can be dismissed,
// and dismissing it leaves the reading where it is so nothing is lost.
//
// The extension's own button links to /library?import=coursework, which opens
// this straight away rather than waiting to be noticed.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { type CalendarEvent, saveCalendarEvent } from "@/lib/workspace/calendar-model";
import { clearScan, extensionInstalled, requestScan } from "@/lib/workspace/extension-bridge";
import { describePlan, planImport } from "@/lib/workspace/coursework-import";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { Check, Loader2 } from "@/lib/workspace/icons";
import { type LmsScan, LMS_LABELS } from "@nemesis/shared";
import { cn } from "@/lib/utils";

/** Suppresses the offer for one reading, so "not now" is not asked again on
 *  every page change. Keyed by the reading itself, so a NEW scan still asks. */
const DISMISSED_KEY = "nemesis.web.coursework-import.dismissed.v1";

function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(stamp: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, stamp);
  } catch {
    // Storage off. The offer reappears; harmless.
  }
}

export function CourseworkImportGate() {
  const { session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const library = useCloudLibrary();
  const uid = session?.user.id ?? null;

  const [scan, setScan] = useState<LmsScan | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (preview || !uid) return;
    let alive = true;
    void (async () => {
      if (!(await extensionInstalled())) return;
      const found = await requestScan();
      if (!alive || !found || found.courses.length === 0) return;

      const asked = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("import");
      // A reading already turned down stays turned down, unless the student
      // came here from the extension asking for it.
      if (!asked && readDismissed() === found.scannedAt) return;

      setScan(found);
      setPicked(new Set(found.courses.map((course) => course.name)));
      setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [preview, uid]);

  // 🔴 MEMOISED BECAUSE THE PLAN MINTS IDENTITIES. Calling planImport on every
  // render gives every event a fresh id each time, and the retry path makes
  // that visible: a partial failure calls setFailed, which re-renders, which
  // re-ids everything — so pressing "Bring them in" again writes a SECOND copy
  // of every event that already saved. Folders survive this (an existing one is
  // treated as success), events do not. Keyed on the reading and the selection,
  // which are the only two things that should ever change the plan.
  const plan = useMemo(() => planImport(scan, picked, newEventId), [scan, picked]);

  const bringIn = useCallback(async () => {
    setSaving(true);
    setFailed([]);
    const problems: string[] = [];

    // plan.folders, NOT plan.courses: once documents come in, a course brings
    // its own sub-folders, and they arrive parents-first so a folder is never
    // created before the one it sits in.
    for (const folder of plan.folders) {
      try {
        await library.createFolder(folder);
      } catch (cause) {
        // Already there is a fine outcome, not a failure.
        const message = cause instanceof Error ? cause.message : "";
        if (!/exist/i.test(message)) problems.push(`the folder ${folder}`);
      }
    }
    for (const event of plan.events as CalendarEvent[]) {
      try {
        await saveCalendarEvent(event, { preview, userId: uid });
      } catch {
        problems.push(event.title);
      }
    }

    if (problems.length > 0) {
      setFailed(problems);
      setSaving(false);
      return;
    }

    // Imported, so the extension no longer needs a copy of this student's
    // coursework sitting in browser storage.
    await clearScan();
    library.reload();
    setSaving(false);
    setDone(describePlan(plan));
  }, [library, plan, preview, uid]);

  function dismiss() {
    if (scan) writeDismissed(scan.scannedAt);
    setOpen(false);
  }

  if (!open || !scan) return null;

  if (done) {
    return (
      <Dialog onOpenChange={(next) => !next && setOpen(false)} open>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your coursework is in</DialogTitle>
            <DialogDescription>{done}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function toggle(name: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <Dialog onOpenChange={(next) => !next && dismiss()} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bring in your coursework</DialogTitle>
          <DialogDescription>
            Read from {LMS_LABELS[scan.lms]}. Each course you keep becomes a folder in your Library, and anything
            with a due date goes on your calendar.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {scan.courses.map((course) => (
            <li key={course.name}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 transition-opacity",
                  !picked.has(course.name) && "opacity-50",
                )}
              >
                <input
                  checked={picked.has(course.name)}
                  className="mt-0.5"
                  onChange={() => toggle(course.name)}
                  type="checkbox"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-medium text-foreground">{course.name}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {[
                      course.code,
                      course.items.length > 0 ? `${course.items.length} items` : null,
                      course.syllabusLinks.length > 0 ? "syllabus available" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "no coursework listed"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="text-[0.6875rem] text-muted-foreground">{describePlan(plan)}</p>
        <p className="text-[0.6875rem] italic text-(--ui-text-tertiary)">
          Read from your school portal, unconfirmed. Everything stays editable.
        </p>

        {failed.length > 0 && (
          <p className="rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2 text-xs text-(--ui-danger)">
            Some of it did not save: {failed.slice(0, 4).join(", ")}
            {failed.length > 4 ? `, and ${failed.length - 4} more` : ""}.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button disabled={saving} onClick={dismiss} variant="outline">
            Not now
          </Button>
          <Button disabled={saving || picked.size === 0} onClick={() => void bringIn()}>
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
            Bring them in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
