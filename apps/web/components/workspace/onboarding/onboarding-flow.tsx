"use client";

// First run: three steps, then the student is in their own semester.
//
// WHAT IT WRITES, AND WHEN. Nothing at all until "Finish". Every step collects
// into local state and the whole lot is written in one pass at the end, so a
// student who changes their mind on step three has not already had folders
// created for step one. The only exception is the completion marker, which is
// written whatever happens — including on a partial failure, because showing
// someone a welcome screen twice is its own kind of broken.
//
// COURSES LIVE IN TWO PLACES because that is how Nemesis already works. There
// is no courses table: `knownCourses` in packages/shared reads the `course`
// field on calendar events and the top-level folders in the Library, so a
// course exists once one of those names it. This writes both — the folder
// gives the student somewhere to put notes today, and the course field is what
// files their recordings correctly tomorrow.
//
// FAILURES ARE REPORTED, NOT SWALLOWED. Creating six folders and four events is
// ten chances to fail, and a silent partial success would leave someone
// wondering where half their semester went. Whatever did not land is named.

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { type CalendarEvent, saveCalendarEvent } from "@/lib/workspace/calendar-model";
import { clearScan } from "@/lib/workspace/extension-bridge";
import { Check, ChevronLeft, Loader2 } from "@/lib/workspace/icons";
import {
  assignCourse,
  mergeCourses,
  nextStep,
  type OnboardingOutcome,
  type OnboardingStep,
  previousStep,
  STEPS,
  stepIndex,
} from "@/lib/workspace/onboarding";
import { type LmsScan } from "@nemesis/shared";
import { cn } from "@/lib/utils";

import { eventsFrom, type ReadFile, StepSyllabi } from "./step-syllabi";
import { StepCourses } from "./step-courses";
import { StepCoursework } from "./step-coursework";
import { StepConnect } from "./step-connect";
import { StepUpgrade } from "./step-upgrade";

const STEP_LABELS: Record<OnboardingStep, string> = {
  connect: "Your apps",
  courses: "Your courses",
  coursework: "Your coursework",
  syllabi: "Your syllabus",
};

interface OnboardingFlowProps {
  /** Called with how it ended. The caller stores the marker and unmounts us. */
  onDone: (outcome: OnboardingOutcome) => void;
}

function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const { session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const library = useCloudLibrary();
  const uid = session?.user.id ?? null;

  const [step, setStep] = useState<OnboardingStep>("courses");
  const [courses, setCourses] = useState<string[]>([]);
  const [files, setFiles] = useState<ReadFile[]>([]);
  const [scan, setScan] = useState<LmsScan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  /** Set once the semester is written, to swap the steps for the "you're set
   *  up" screen. Null means we are still collecting. */
  const [saved, setSaved] = useState<{ courses: number; events: number } | null>(null);

  /** Every course the student will end up with: the ones they typed, the ones
   *  their syllabi named, and the ones they ticked from their portal. */
  const allCourses = useMemo(() => {
    const fromSyllabi = files.map((file) => file.result.course).filter((name): name is string => Boolean(name));
    const fromScan = (scan?.courses ?? []).map((course) => course.name).filter((name) => picked.has(name));
    return mergeCourses(mergeCourses(courses, fromSyllabi), fromScan);
  }, [courses, files, picked, scan]);

  /** Everything destined for the calendar, each row already stamped with its
   *  course where we can tell. */
  const allEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    for (const file of files) {
      events.push(...assignCourse(eventsFrom(file), file.result.course, courses));
    }
    for (const course of scan?.courses ?? []) {
      if (!picked.has(course.name)) continue;
      for (const item of course.items) {
        // Only dated rows can go on a calendar. An undated one still counts as
        // coursework, but inventing a day for it would be a lie the student
        // cannot see.
        if (!item.dueDate) continue;
        events.push({
          course: course.name,
          date: item.dueDate,
          id: newEventId(),
          kind: item.kind === "class" ? "class" : item.kind === "exam" ? "exam" : item.kind === "assignment" ? "assignment" : "other",
          note: `Read from ${course.name} on your school portal`,
          title: item.title,
          ...(item.dueTime ? { time: item.dueTime } : {}),
        });
      }
    }
    return events;
  }, [courses, files, picked, scan]);

  const finish = useCallback(async () => {
    setSaving(true);
    const failed: string[] = [];

    for (const course of allCourses) {
      try {
        await library.createFolder(course);
      } catch (cause) {
        // An existing folder is a fine outcome, not a failure — a student who
        // set up on another device already has it.
        const message = cause instanceof Error ? cause.message : "";
        if (!/exist/i.test(message)) failed.push(`the folder for ${course}`);
      }
    }

    for (const event of allEvents) {
      try {
        await saveCalendarEvent(event, { preview, userId: uid });
      } catch {
        failed.push(event.title);
      }
    }

    if (failed.length > 0) {
      setProblems(failed);
      setSaving(false);
      return;
    }

    // The portal reading has been imported, so the extension no longer needs to
    // hold a copy of this student's coursework.
    if (scan) await clearScan();
    library.reload();

    // Everything is written. Only now do we consider showing the upgrade
    // screen, and only to someone on the free plan — selling a subscriber
    // their own plan back on day one is worse than saying nothing. A failed
    // entitlements lookup means we do not know, so we do not ask.
    let onFreePlan = false;
    try {
      const snapshot = await fetchEntitlements();
      onFreePlan = (snapshot.plan ?? "free").toLowerCase() === "free";
    } catch {
      onFreePlan = false;
    }

    // And only to someone who actually set something up. A student who clicked
    // straight through without adding a course has just told us they are not
    // here to buy anything today; answering that with a pricing screen is how
    // a product starts feeling pushy.
    const didSomething = allCourses.length > 0 || allEvents.length > 0;

    if (onFreePlan && didSomething) {
      setSaved({ courses: allCourses.length, events: allEvents.length });
      setSaving(false);
      return;
    }
    onDone("finished");
  }, [allCourses, allEvents, library, onDone, preview, scan, uid]);

  const index = stepIndex(step);
  const back = previousStep(step);
  const forward = nextStep(step);

  // Everything is saved; this is the offer screen, and it owns the whole panel.
  // Closing it counts as finishing, because it already has.
  if (saved) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-(--ui-bg-primary) p-4 sm:items-center sm:p-8">
        <div className="flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-(--ui-bg-secondary) p-5 shadow-xl sm:p-7">
          <StepUpgrade
            courseCount={saved.courses}
            eventCount={saved.events}
            onDone={() => onDone("finished")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-(--ui-bg-primary) p-4 sm:items-center sm:p-8">
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-(--ui-bg-secondary) p-5 shadow-xl sm:p-7">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                Step {index + 1} of {STEPS.length}
              </p>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Let&rsquo;s set up your semester</h1>
            </div>
            <Button onClick={() => onDone("skipped")} size="sm" type="button" variant="ghost">
              Skip setup
            </Button>
          </div>
          <ol className="flex gap-1.5">
            {STEPS.map((one, position) => (
              <li className="flex flex-1 flex-col gap-1" key={one}>
                <span
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    position <= index ? "bg-(--ui-accent)" : "bg-(--ui-bg-quaternary)",
                  )}
                />
                <span
                  className={cn(
                    "text-[0.625rem]",
                    position === index ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {STEP_LABELS[one]}
                </span>
              </li>
            ))}
          </ol>
        </header>

        {step === "courses" && <StepCourses courses={courses} onChange={setCourses} />}
        {step === "syllabi" && <StepSyllabi files={files} onChange={setFiles} uid={uid} />}
        {step === "coursework" && (
          <StepCoursework
            chosen={picked}
            knownCourses={courses}
            onChosenChange={setPicked}
            onScanChange={setScan}
            scan={scan}
          />
        )}
        {/* 🔴 TAKES NO PROPS AND RETURNS NOTHING. Connecting an app happens against the account
            immediately, out at the provider, so it is the one part of this flow that does NOT
            collect into local state for the finish button to write. Nothing here can fail the
            save, and nothing here is undone by pressing Skip. */}
        {step === "connect" && <StepConnect />}

        {problems.length > 0 && (
          <div className="rounded-lg border border-(--ui-danger)/40 bg-(--ui-danger)/10 px-3 py-2">
            <p className="text-xs font-medium text-(--ui-danger)">Some of it did not save</p>
            <p className="mt-0.5 text-[0.6875rem] text-(--ui-danger)">
              {problems.slice(0, 5).join(", ")}
              {problems.length > 5 ? `, and ${problems.length - 5} more` : ""}. Try again, or continue and add them
              yourself.
            </p>
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            {back && (
              <Button disabled={saving} onClick={() => setStep(back)} size="sm" type="button" variant="ghost">
                <ChevronLeft size={14} /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {forward ? (
              <Button onClick={() => setStep(forward)} type="button">
                Continue
              </Button>
            ) : (
              <>
                {problems.length > 0 && (
                  <Button disabled={saving} onClick={() => onDone("finished")} type="button" variant="outline">
                    Continue anyway
                  </Button>
                )}
                <Button disabled={saving} onClick={() => void finish()} type="button">
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                  {allCourses.length === 0 && allEvents.length === 0 ? "Finish" : "Set up my semester"}
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
