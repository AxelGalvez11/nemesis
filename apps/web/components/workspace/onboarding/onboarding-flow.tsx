"use client";

// First run: four steps, and the student leaves already asking a question.
//
// THE ORDER IS THE CORE LOOP. Courses and a syllabus give the account a shape;
// "add your first material" and "ask your first question" are the two halves
// of what Nemesis actually does. A new account used to end on a step that
// asked for a browser extension nobody had heard of. That offer now lives in
// the workspace layout (CourseworkImportGate) and appears later, once there is
// a Library to import into.
//
// WHAT IT WRITES, AND WHEN. Courses and calendar dates are collected into
// local state and written in one pass when the student leaves the material
// step, so someone who changes their mind on step two has not already had
// folders created for step one. Material is the exception: a file is saved to
// the Library the moment it is read, because the next step asks about it. The
// completion marker is written whatever happens, including on a partial
// failure, because showing someone a welcome screen twice is its own kind of
// broken.
//
// COURSES LIVE IN TWO PLACES because that is how Nemesis already works. There
// is no courses table: `knownCourses` in packages/shared reads the `course`
// field on calendar events and the top-level folders in the Library, so a
// course exists once one of those names it. This writes both: the folder
// gives the student somewhere to put notes today, and the course field is what
// files their recordings correctly tomorrow.
//
// THE PLAN OFFER COMES AFTER THE SAVE, NEVER BEFORE, and only to a student on
// the free plan who set something up. It sits between the material step and
// the first question, so closing it lands on the question rather than on
// nothing.
//
// FAILURES ARE REPORTED, NOT SWALLOWED. Creating six folders and four events is
// ten chances to fail, and a silent partial success would leave someone
// wondering where half their semester went. Whatever did not land is named.

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";
import { useAuth } from "@/components/AuthProvider";
import { fetchEntitlements } from "@/lib/api";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { type CalendarEvent, saveCalendarEvent } from "@/lib/workspace/calendar-model";
import { stashComposerPrefill } from "@/lib/workspace/composer-prefill";
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
import { cn } from "@/lib/utils";

import { eventsFrom, type ReadFile, StepSyllabi } from "./step-syllabi";
import { StepCourses } from "./step-courses";
import { type MaterialRow, StepMaterial } from "./step-material";
import { StepQuestion } from "./step-question";
import { StepUpgrade } from "./step-upgrade";

const STEP_LABELS: Record<OnboardingStep, string> = {
  courses: "Your courses",
  material: "Your material",
  question: "First question",
  syllabi: "Your syllabus",
};

/** Where the chat composer lives. The first question is handed to it. */
const COMPOSER_ROUTE = "/learn";

interface OnboardingFlowProps {
  /** Called with how it ended. The caller stores the marker and unmounts us. */
  onDone: (outcome: OnboardingOutcome) => void;
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps) {
  const { session } = useAuth();
  const preview = useWorkspacePreview() !== null;
  const library = useCloudLibrary();
  const router = useRouter();
  const pathname = usePathname();
  const uid = session?.user.id ?? null;

  const [step, setStep] = useState<OnboardingStep>("courses");
  const [courses, setCourses] = useState<string[]>([]);
  const [files, setFiles] = useState<ReadFile[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  /** True once courses and dates are written, so Back from the question step
   *  cannot write them a second time. */
  const [written, setWritten] = useState(false);
  /** Set to show the plan offer over the steps. Null means the steps show. */
  const [offer, setOffer] = useState<{ courses: number; events: number; materials: number } | null>(null);

  /** Every course the student will end up with: the ones they typed and the
   *  ones their syllabi named. */
  const allCourses = useMemo(() => {
    const fromSyllabi = files.map((file) => file.result.course).filter((name): name is string => Boolean(name));
    return mergeCourses(courses, fromSyllabi);
  }, [courses, files]);

  /** Everything destined for the calendar, each row already stamped with its
   *  course where we can tell. */
  const allEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    for (const file of files) {
      events.push(...assignCourse(eventsFrom(file), file.result.course, courses));
    }
    return events;
  }, [courses, files]);

  const materialCount = useMemo(() => materials.filter((row) => row.state === "done").length, [materials]);
  const materialBusy = useMemo(() => materials.some((row) => row.state === "reading"), [materials]);

  /** Write the semester, then decide whether the plan offer shows on the way
   *  to the first question. Runs once, when the student leaves the material
   *  step; a second pass (Back, then Continue again) skips straight through. */
  const saveAndContinue = useCallback(async () => {
    if (written) {
      setStep("question");
      return;
    }
    setSaving(true);
    const failed: string[] = [];

    for (const course of allCourses) {
      try {
        await library.createFolder(course);
      } catch (cause) {
        // An existing folder is a fine outcome, not a failure. A student who
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

    library.reload();
    setWritten(true);

    // Everything is written. Only now do we consider showing the plan offer,
    // and only to someone on the free plan. Selling a subscriber their own
    // plan back on day one is worse than saying nothing. A failed entitlements
    // lookup means we do not know, so we do not ask.
    let onFreePlan = false;
    try {
      const snapshot = await fetchEntitlements();
      onFreePlan = (snapshot.plan ?? "free").toLowerCase() === "free";
    } catch {
      onFreePlan = false;
    }

    // And only to someone who actually set something up. A student who clicked
    // straight through without adding a course or a file has just told us
    // they are not here to buy anything today; answering that with a pricing
    // screen is how a product starts feeling pushy.
    const didSomething = allCourses.length > 0 || allEvents.length > 0 || materialCount > 0;

    setSaving(false);
    if (onFreePlan && didSomething) {
      setOffer({ courses: allCourses.length, events: allEvents.length, materials: materialCount });
      return;
    }
    setStep("question");
  }, [allCourses, allEvents, library, materialCount, preview, uid, written]);

  /** The student picked a first question. Close the flow and hand the words to
   *  the composer. Nothing is sent; the words wait in the box. */
  const askFirstQuestion = useCallback(
    (prompt: string) => {
      stashComposerPrefill(prompt);
      onDone("finished");
      if (pathname !== COMPOSER_ROUTE) router.push(COMPOSER_ROUTE);
    },
    [onDone, pathname, router],
  );

  const index = stepIndex(step);
  const back = previousStep(step);
  const forward = nextStep(step);

  // The plan offer owns the whole panel while it shows. Closing it goes on to
  // the first question; nothing has been lost, because everything is saved.
  if (offer) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-(--ui-bg-primary) p-4 sm:items-center sm:p-8">
        <div className="flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border bg-(--ui-bg-secondary) p-5 shadow-xl sm:p-7">
          <StepUpgrade
            courseCount={offer.courses}
            eventCount={offer.events}
            materialCount={offer.materials}
            onDone={() => {
              setOffer(null);
              setStep("question");
            }}
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
            <Button
              disabled={saving || materialBusy}
              onClick={() => onDone(written ? "finished" : "skipped")}
              size="sm"
              type="button"
              variant="ghost"
            >
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
        {step === "material" && <StepMaterial onChange={setMaterials} rows={materials} uid={uid} />}
        {step === "question" && (
          <StepQuestion courses={allCourses} hasMaterial={materialCount > 0} onPick={askFirstQuestion} />
        )}

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
              <Button
                disabled={saving || materialBusy}
                onClick={() => setStep(back)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeft size={14} /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "question" ? (
              <Button onClick={() => onDone("finished")} type="button" variant="outline">
                Skip for now
              </Button>
            ) : step === "material" ? (
              <>
                {problems.length > 0 && (
                  <Button disabled={saving} onClick={() => setStep("question")} type="button" variant="outline">
                    Continue anyway
                  </Button>
                )}
                <Button disabled={saving || materialBusy} onClick={() => void saveAndContinue()} type="button">
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                  {materialCount === 0 ? "Skip" : "Continue"}
                </Button>
              </>
            ) : forward ? (
              <Button onClick={() => setStep(forward)} type="button">
                Continue
              </Button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
