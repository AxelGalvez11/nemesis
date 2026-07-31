"use client";

// Step three: bring in what is already on your school portal.
//
// ENTIRELY OPTIONAL, AND IT SAYS SO. Plenty of students have no portal to
// connect: a departmental web page, a printed handout, or nothing at all. This
// step must never read as a requirement, and the flow must finish cleanly for
// someone who skips it — which is why "Skip" is a plain visible control here
// and not a link hidden in a corner.
//
// WHY AN EXTENSION AND NOT AN API. Canvas and Blackboard both have real APIs,
// and both need either a developer key the university has to approve or an
// access token the student generates from a settings page they have never
// opened. Either one ends the setup for most people. A browser extension reads
// a page the student is ALREADY signed in to, so there is no institution to
// ask and nothing to configure.
//
// The extension never talks to our servers and holds no credentials. It reads
// the page, keeps the result in the browser, and this screen asks for it. Every
// scan is sanitised on arrival — see lib/workspace/extension-bridge.ts.

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { extensionInstalled, requestScan } from "@/lib/workspace/extension-bridge";
import { CheckCircle2, Download, Loader2, RefreshCw } from "@/lib/workspace/icons";
import { type LmsScan, LMS_LABELS, scanItemCount } from "@nemesis/shared";
import { cn } from "@/lib/utils";

type Presence = "checking" | "present" | "absent";

interface StepCourseworkProps {
  /** Courses the student has already named, so the picker can show which ones
   *  are new rather than presenting everything as a fresh discovery. */
  knownCourses: readonly string[];
  chosen: Set<string>;
  onChosenChange: (chosen: Set<string>) => void;
  scan: LmsScan | null;
  onScanChange: (scan: LmsScan | null) => void;
}

export function StepCoursework({ chosen, knownCourses, onChosenChange, onScanChange, scan }: StepCourseworkProps) {
  const [presence, setPresence] = useState<Presence>("checking");
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => {
    setBusy(true);
    try {
      const installed = await extensionInstalled();
      setPresence(installed ? "present" : "absent");
      if (!installed) {
        onScanChange(null);
        return;
      }
      const found = await requestScan();
      onScanChange(found);
      // Everything starts ticked, same reasoning as the syllabus review: the
      // student asked for this, and unticking the odd one is less work than
      // ticking all six.
      if (found) onChosenChange(new Set(found.courses.map((course) => course.name)));
    } finally {
      setBusy(false);
    }
  }, [onChosenChange, onScanChange]);

  useEffect(() => {
    void look();
    // Runs once on mount. `look` is stable enough for that, and re-running on
    // every parent render would poll the extension continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Bring in your coursework</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          If your school uses Canvas, Blackboard, Moodle or Brightspace, the Nemesis browser extension can read
          the courses already listed there. It only reads, and only when you ask it to.
        </p>
      </div>

      {presence === "checking" && (
        <p className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="animate-spin" size={14} /> Looking for the extension…
        </p>
      )}

      {presence === "absent" && <NotInstalled busy={busy} onRetry={() => void look()} />}

      {presence === "present" && (
        <Installed
          busy={busy}
          chosen={chosen}
          knownCourses={knownCourses}
          onChosenChange={onChosenChange}
          onRetry={() => void look()}
          scan={scan}
        />
      )}

      <p className="text-[0.6875rem] text-muted-foreground">
        No portal, or would rather not? Skip this. Nothing else depends on it, and you can come back any time.
      </p>
    </div>
  );
}

function NotInstalled({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border px-4 py-5">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 flex-none text-muted-foreground" size={18} />
        <div>
          <p className="text-xs font-medium text-foreground">The extension is not installed in this browser</p>
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            It is a Chrome extension that reads your school portal. It cannot change anything there, it holds no
            password of yours, and what it reads stays in this browser until you bring it in here.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={onRetry} size="sm" type="button" variant="outline">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Check again
        </Button>
      </div>
      {/* Deliberately no install link yet: the extension is not on the Chrome
          Web Store, and sending a student to a dead page is worse than saying
          nothing. See extension/README.md. */}
      <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
        Not published yet — this is here so the step works the day it is.
      </p>
    </div>
  );
}

interface InstalledProps {
  scan: LmsScan | null;
  chosen: Set<string>;
  knownCourses: readonly string[];
  onChosenChange: (chosen: Set<string>) => void;
  onRetry: () => void;
  busy: boolean;
}

function Installed({ busy, chosen, knownCourses, onChosenChange, onRetry, scan }: InstalledProps) {
  const known = new Set(knownCourses.map((course) => course.toLocaleLowerCase()));

  function toggle(name: string) {
    const next = new Set(chosen);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChosenChange(next);
  }

  if (!scan || scan.courses.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-5">
        <p className="text-xs font-medium text-foreground">The extension is installed, with nothing read yet</p>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-[0.6875rem] text-muted-foreground">
          <li>Open your school portal in another tab and sign in as usual.</li>
          <li>Go to the page that lists your courses.</li>
          <li>Click the Nemesis icon in your toolbar, then &ldquo;Read this page&rdquo;.</li>
          <li>Come back here and check again.</li>
        </ol>
        <div>
          <Button disabled={busy} onClick={onRetry} size="sm" type="button" variant="outline">
            {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Check again
          </Button>
        </div>
      </div>
    );
  }

  const items = scanItemCount(scan);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-foreground">
          <CheckCircle2 className="text-(--ui-success)" size={14} />
          Read {scan.courses.length} {scan.courses.length === 1 ? "course" : "courses"}
          {items > 0 ? ` and ${items} ${items === 1 ? "item" : "items"}` : ""} from {LMS_LABELS[scan.lms]}.
        </p>
        <Button disabled={busy} onClick={onRetry} size="sm" type="button" variant="outline">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Read again
        </Button>
      </div>

      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {scan.courses.map((course) => (
          <li key={course.name}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 transition-opacity",
                !chosen.has(course.name) && "opacity-50",
              )}
            >
              <input
                checked={chosen.has(course.name)}
                className="mt-0.5"
                onChange={() => toggle(course.name)}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs font-medium text-foreground">{course.name}</span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {[
                    course.items.length > 0
                      ? `${course.items.length} ${course.items.length === 1 ? "item" : "items"} with dates`
                      : null,
                    course.syllabusLinks.length > 0
                      ? `${course.syllabusLinks.length} syllabus ${course.syllabusLinks.length === 1 ? "file" : "files"}`
                      : null,
                    known.has(course.name.toLocaleLowerCase()) ? "already on your list" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no coursework listed"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="text-[0.6875rem] italic text-(--ui-text-tertiary)">
        Read from your school portal, unconfirmed. Anything with a date goes on your calendar where you can edit
        or delete it.
      </p>
    </div>
  );
}
