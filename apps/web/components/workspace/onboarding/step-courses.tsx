"use client";

// Step one: name your courses.
//
// A free-text box and a list of what you typed. That is the whole design, and
// the restraint is the point.
//
// WHY THERE IS NO SUBJECT PICKER. Nemesis is used by law students, mechanical
// engineers, nurses, historians and apprentice welders. Any dropdown we could
// offer would be a list of the disciplines we happened to think of, and every
// student outside it would learn on their first screen that the product was
// not built for them. A text box is right for all of them, and it has the
// happy property of storing exactly the words the student will recognise later
// in their own Library.
//
// Pasting works too: a schedule copied out of a portal arrives as lines or
// commas, and splitting on those is cheaper for the student than typing six
// names one at a time.

import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Input } from "@/components/desktop-ui/input";
import { Plus, X } from "@/lib/workspace/icons";
import { addCourse, MAX_COURSES, mergeCourses, removeCourse, splitCourseInput } from "@/lib/workspace/onboarding";

interface StepCoursesProps {
  courses: string[];
  onChange: (courses: string[]) => void;
}

export function StepCourses({ courses, onChange }: StepCoursesProps) {
  const [draft, setDraft] = useState("");
  const full = courses.length >= MAX_COURSES;

  function commit() {
    const parts = splitCourseInput(draft);
    if (parts.length === 0) return;
    // One name goes through addCourse, several through mergeCourses — same
    // rules either way, so a paste and a keystroke cannot disagree.
    onChange(parts.length === 1 ? addCourse(courses, parts[0] as string) : mergeCourses(courses, parts));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">What are you taking?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Type them however you say them. These become the folders your notes and recordings are filed
          into, so use the names you will recognise.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          aria-label="Course name"
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commit();
          }}
          placeholder="Contract Law"
          value={draft}
        />
        <Button disabled={full || draft.trim().length === 0} onClick={commit} type="button">
          <Plus size={14} /> Add
        </Button>
      </div>

      {full && (
        <p className="text-[0.6875rem] text-muted-foreground">
          That is {MAX_COURSES} courses, which is as many as this screen takes. You can add more from your
          Library at any time.
        </p>
      )}

      {courses.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {courses.map((course) => (
            <li
              className="flex items-center gap-1.5 rounded-full border border-border bg-(--ui-bg-quaternary)/50 py-1 pl-3 pr-1.5 text-xs"
              key={course}
            >
              <span className="max-w-60 truncate text-foreground">{course}</span>
              <button
                aria-label={`Remove ${course}`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground"
                onClick={() => onChange(removeCourse(courses, course))}
                type="button"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Nothing yet. You can skip this and add courses later.
        </p>
      )}
    </div>
  );
}
