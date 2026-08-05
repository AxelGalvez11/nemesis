"use client";

// Bringing a portal reading in — a three-step wizard.
//
// THE HOLE THIS FILLS. Importing only existed inside the first-run flow, so a
// student who had already finished onboarding could scan their Blackboard, see
// "Read 9 courses", and then find no way at all to get them into Nemesis. The
// extension holds a reading; nothing was listening for it.
//
// 🔴 AND THE HOLE INSIDE THAT ONE. Until now this screen created FOLDERS and
// CALENDAR EVENTS and nothing else. The documents the extension had found were
// used to work out which folders to make and to write the summary sentence —
// so it announced "this adds 34 folders and 107 documents" and then created 34
// empty folders. Every scraped lecture was discarded at the last step, silently,
// while the wording promised otherwise. That is what the third step now fixes:
// the files are fetched, read, and filed.
//
// WHY A WIZARD AND NOT ONE SCREEN. Three decisions that do not fit together:
//   1. WHICH COURSES — a student three years in has every course they have ever
//      taken in this list, so it is grouped by term with the newest ticked.
//   2. WHICH DOCUMENTS — a semester is a hundred-odd files and not all of them
//      are wanted; they are shown in the portal's own folders, ticked, with a
//      per-folder toggle.
//   3. THE IMPORT ITSELF — minutes of work with real per-file failures, which
//      needs a screen that can report them rather than a button that spins.
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
import {
  coursesByTerm,
  describePlan,
  documentKey,
  newestTermCourseNames,
  planImport,
} from "@/lib/workspace/coursework-import";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { Check, Loader2 } from "@/lib/workspace/icons";
import { type LmsScan, LMS_LABELS } from "@nemesis/shared";
import { cn } from "@/lib/utils";

import { useCourseworkImport } from "./use-coursework-import";

/** Suppresses the offer for one reading, so "not now" is not asked again on
 *  every page change. Keyed by the reading itself, so a NEW scan still asks. */
const DISMISSED_KEY = "nemesis.web.coursework-import.dismissed.v1";

type Step = "courses" | "documents" | "importing" | "done";

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

const rowClass = "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 transition-opacity";

export function CourseworkImportGate() {
  const { session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const library = useCloudLibrary();
  const uid = session?.user.id ?? null;

  const [scan, setScan] = useState<LmsScan | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("courses");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Document keys the student UNTICKED. Tracking the exclusions rather than
   *  the selections means a course whose documents arrive later (the sweep is
   *  still running) is fully ticked by default instead of silently empty. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<string | null>(null);

  const { cancel, progress, running, runImport } = useCourseworkImport({
    createFolder: library.createFolder,
    createNote: library.createNote,
    uid,
  });

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
      // 🔴 THE NEWEST TERM, NOT EVERYTHING. Ticking all 31 courses of a degree
      // by default would import three years of finished material to get at this
      // semester's four courses.
      setPicked(new Set(newestTermCourseNames(found)));
      setOpen(true);
    })();
    return () => {
      alive = false;
    };
  }, [preview, uid]);

  const pickedDocuments = useMemo(() => {
    if (!scan) return new Set<string>();
    const keys = new Set<string>();
    for (const course of scan.courses) {
      if (!picked.has(course.name)) continue;
      for (const doc of course.documents ?? []) {
        const key = documentKey(course.name, doc.title);
        if (!excluded.has(key)) keys.add(key);
      }
    }
    return keys;
  }, [excluded, picked, scan]);

  // 🔴 MEMOISED BECAUSE THE PLAN MINTS IDENTITIES. Calling planImport on every
  // render gives every event a fresh id each time, and the retry path makes
  // that visible: a partial failure re-renders, which re-ids everything — so
  // pressing the button again writes a SECOND copy of every event that already
  // saved. Folders survive this (an existing one is treated as success), events
  // do not. Keyed on the reading and the selection, which are the only two
  // things that should ever change the plan.
  const plan = useMemo(
    () => planImport(scan, picked, newEventId, pickedDocuments),
    [scan, picked, pickedDocuments],
  );

  const termGroups = useMemo(() => coursesByTerm(scan), [scan]);

  /** Documents of the picked courses, grouped by the folder they sat in on the
   *  portal — the student's own structure, which is the one they navigate by. */
  const documentFolders = useMemo(() => {
    const groups = new Map<string, Array<{ key: string; title: string; fileType?: string }>>();
    if (!scan) return groups;
    for (const course of scan.courses) {
      if (!picked.has(course.name)) continue;
      for (const doc of course.documents ?? []) {
        const path = [course.name, ...doc.folder].join(" / ");
        const bucket = groups.get(path) ?? [];
        bucket.push({ key: documentKey(course.name, doc.title), title: doc.title, ...(doc.fileType ? { fileType: doc.fileType } : {}) });
        groups.set(path, bucket);
      }
    }
    return groups;
  }, [picked, scan]);

  const toggleCourse = (name: string) => {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleDocument = (key: string) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFolder = (keys: readonly string[]) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      const allOn = keys.every((key) => !next.has(key));
      for (const key of keys) {
        if (allOn) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const start = useCallback(async () => {
    setStep("importing");
    // The calendar half is unchanged and runs first: it is fast, and a student
    // who stops a long file import partway should still have their dates.
    const eventFailures: string[] = [];
    for (const event of plan.events as CalendarEvent[]) {
      try {
        await saveCalendarEvent(event, { preview, userId: uid });
      } catch {
        eventFailures.push(event.title);
      }
    }

    const result = await runImport(plan.folders, plan.documents);
    // 🔴 ONLY THROW THE READING AWAY WHEN IT IS FINISHED WITH.
    //
    // clearScan used to run unconditionally. Press Stop forty documents into a
    // hundred and the remaining sixty were gone — along with the minutes of
    // background-tab sweeping that found them — with no way back but scanning
    // the whole portal again. The same bug made a second import impossible:
    // bring in this term, come back for last term, and there was nothing left
    // to bring.
    //
    // Kept whenever anything is outstanding. The cost of keeping it is a
    // reading sitting in extension storage a while longer; the cost of dropping
    // it is work the student has to redo.
    if (result.done >= result.total) await clearScan();
    library.reload();

    const parts = [`${result.imported} of ${result.total} documents are in your Library`];
    if (result.stored > 0) parts.push(`${result.stored} original files kept`);
    if (plan.events.length > 0) parts.push(`${plan.events.length - eventFailures.length} dates on your calendar`);
    setSummary(parts.join(" · "));
    setStep("done");
  }, [library, plan, preview, runImport, uid]);

  function dismiss() {
    if (scan) writeDismissed(scan.scannedAt);
    setOpen(false);
  }

  if (!open || !scan) return null;

  const totalDocuments = plan.documents.length;

  return (
    <Dialog onOpenChange={(next) => !next && !running && dismiss()} open>
      <DialogContent className="sm:max-w-lg">
        {step === "courses" && (
          <>
            <DialogHeader>
              <DialogTitle>Which courses?</DialogTitle>
              <DialogDescription>
                Read from {LMS_LABELS[scan.lms]}. Your newest term is picked — everything else is still here if you
                want it.
              </DialogDescription>
            </DialogHeader>

            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {termGroups.map((group) => (
                <li key={group.term ?? "no-term"}>
                  <p className="px-1 pb-1 pt-2 text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                    {/* The portal's own words where it wrote any; ours only for the absence. */}
                    {group.term ?? "No term"}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {group.courses.map((course) => (
                      <li key={course.name}>
                        <label className={cn(rowClass, !picked.has(course.name) && "opacity-50")}>
                          <input
                            checked={picked.has(course.name)}
                            className="mt-0.5"
                            onChange={() => toggleCourse(course.name)}
                            type="checkbox"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-xs font-medium text-foreground">{course.name}</span>
                            <span className="text-[0.6875rem] text-muted-foreground">
                              {[
                                course.code,
                                // ABSENT and EMPTY are different facts: a course
                                // that was never opened has no `documents` field
                                // at all, and saying "0 documents" about it would
                                // be a claim we never checked.
                                course.documents === undefined
                                  ? "not opened yet"
                                  : `${course.documents.length} documents`,
                                course.items.length > 0 ? `${course.items.length} dates` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <DialogFooter className="gap-2">
              <Button onClick={dismiss} variant="outline">Not now</Button>
              <Button disabled={picked.size === 0} onClick={() => setStep("documents")}>Next</Button>
            </DialogFooter>
          </>
        )}

        {step === "documents" && (
          <>
            <DialogHeader>
              <DialogTitle>Which documents?</DialogTitle>
              <DialogDescription>
                Shown in the folders your course uses. Each one is downloaded, read, and filed in the same place in
                your Library — so you can search it and ask about it.
              </DialogDescription>
            </DialogHeader>

            {documentFolders.size === 0 ? (
              // 🔴 "NOTHING FOUND" AND "NEVER LOOKED" ARE DIFFERENT NEWS. A
              // course list scan finds no documents because it never opened a
              // course, which is not the same as an empty course.
              <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                No documents in this reading yet. In the Nemesis extension, tick your courses and press
                “Read the ticked courses” — it opens each one and reads what is inside.
              </p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {[...documentFolders.entries()].map(([path, docs]) => {
                  const keys = docs.map((doc) => doc.key);
                  const on = keys.filter((key) => !excluded.has(key)).length;
                  return (
                    <li key={path}>
                      <div className="flex items-baseline justify-between gap-2 px-1 pb-1">
                        <p className="truncate text-[0.625rem] uppercase tracking-wide text-muted-foreground">{path}</p>
                        <button
                          className="shrink-0 text-[0.625rem] text-muted-foreground underline"
                          onClick={() => toggleFolder(keys)}
                          type="button"
                        >
                          {on === keys.length ? "none" : "all"}
                        </button>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {docs.map((doc) => (
                          <li key={doc.key}>
                            <label className={cn(rowClass, "py-1.5", excluded.has(doc.key) && "opacity-50")}>
                              <input
                                checked={!excluded.has(doc.key)}
                                className="mt-0.5"
                                onChange={() => toggleDocument(doc.key)}
                                type="checkbox"
                              />
                              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{doc.title}</span>
                              {doc.fileType && (
                                <span className="shrink-0 text-[0.625rem] uppercase text-muted-foreground">
                                  {doc.fileType}
                                </span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-[0.6875rem] text-muted-foreground">{describePlan(plan)}</p>
            <p className="text-[0.6875rem] italic text-(--ui-text-tertiary)">
              Read from your school portal, unconfirmed. Everything stays editable.
            </p>

            <DialogFooter className="gap-2">
              <Button onClick={() => setStep("courses")} variant="outline">Back</Button>
              <Button disabled={totalDocuments === 0 && plan.events.length === 0} onClick={() => void start()}>
                <Check size={14} />
                Bring them in
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "importing" && (
          <>
            <DialogHeader>
              <DialogTitle>Bringing your coursework in</DialogTitle>
              <DialogDescription>
                Each file is downloaded from your portal and read. This takes a moment per document — you can leave
                this open and carry on.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground transition-[width]"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <Loader2 className="mr-1.5 inline animate-spin" size={12} />
                {progress.current || "Preparing"} — {progress.done} of {progress.total}
              </p>
              {progress.failures.length > 0 && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  {progress.failures.length} could not be brought in so far.
                </p>
              )}
            </div>

            <DialogFooter>
              {/* Stopping keeps what has already landed. An import of eighty
                  files that can only be abandoned by closing the tab is one the
                  student will abandon by closing the tab. */}
              <Button disabled={!running} onClick={cancel} variant="outline">Stop</Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>Your coursework is in</DialogTitle>
              <DialogDescription>{summary}</DialogDescription>
            </DialogHeader>

            {progress.failures.length > 0 && (
              // NAMED, not counted. A student can go and get a file we could not
              // — but only if they know which one.
              <div className="max-h-40 overflow-y-auto rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2">
                <p className="pb-1 text-xs font-medium text-(--ui-danger)">These did not come through:</p>
                <ul className="flex flex-col gap-0.5">
                  {progress.failures.map((failure) => (
                    <li className="text-[0.6875rem] text-(--ui-danger)" key={failure}>{failure}</li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
