"use client";

// What the turn did, drawn the way ChatGPT's desktop app draws it: the model's sentence about what
// it is about to do, then one row that opens into the steps, each beside the mark of the thing
// that did it, and the answer under all of that.
//
// 🔴🔴 OWNER, 2026-09-04, WITH THREE SCREENSHOTS OF CHATGPT ON SCREEN: *"it will tell you like
// what it's gonna do, or reiterate things before it goes and does things. And as you can see
// here, the thinking preview is hidden, and when you unhide it, it shows like it's running
// commands, it's searching web, with like an icon or favicon. So can we have that for Nemesis
// too, rather than just having like a thinking preview."* Theirs, read off the screenshots:
//
//   [the plan, a paragraph in the answer's own type]
//   ⬡ Used Net.ankiweb.anki integration, read files, ran commands, searched the web  ⌄
//       ▢ Ran command
//       ▢ Listed files in User 1
//       🌐 Searched the web for site:cdc.gov rsv vaccine guidance adults 50 74 2026 …
//       ⬡ Reopen Anki to review the misplaced drug cards
//   [the answer]
//
// Collapsed once the answer is in; open, and growing, while the turn works, with the running step
// lit. The mark is the app's own logo for an app, the globe for a search with the sites' favicons
// after it, the file's own mark for a document, and the lookup glyph for a computation.
//
// 🔴🔴 EVERY ROW IS SOMETHING THAT HAPPENED. `activity-trail.ts` holds the rule; this file only
// draws. The one line that is not a step is the caption's own (`label`): the model's milestone or
// the system's name for the stage, lit while nothing named is running, so a turn's plan lines
// still speak between its steps rather than the list going silent.
//
// 🔴 THE SAME SLOT, THE SAME 16/24 TYPE THE CAPTION HAD (measured in the owner's own ChatGPT on
// 2026-08-31: the live line at 16px/24px in the answer's column, and a finished "Worked for 59s"
// in the same slot). The steps are the small step of the scale on a 22px line, indented under the
// words rather than under the chevron, the rule `canvas-thinking-summary.tsx` stated.

import { useState } from "react";

import { DomainChips } from "@/components/DomainChips";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Icon } from "@/components/icons";
import { activitySummary, stepLabel, type ActivityStep, type ActivityTrail } from "@/lib/learn/activity-trail";
import { fileMark } from "@/lib/learn/kind-mark";
import { workedForLabel } from "@/lib/learn/worked-for";
import { logoFor } from "@/lib/workspace/app-logos";
import { cn } from "@/lib/utils";

import { CanvasThinkingPreview } from "./canvas-thinking-preview";

export function ActivityTrailView({
  app = null,
  domains = [],
  inColumn = true,
  label = null,
  live = false,
  trail,
  web = false,
}: {
  /** The connected app the running step is against, for the caption's own mark. Live only. */
  app?: string | null;
  /** The sites the turn has read so far, accumulated and deduped (`searchedDomains`). Live only. */
  domains?: readonly string[];
  /** The caption's own line while the turn works: the milestone for this stage, or the system's
   *  name for it. Drawn lit as the last item when no step is running. Live only. */
  label?: string | null;
  /** Whether the turn is still working: open, growing, the running step lit. */
  live?: boolean;
  /**
   * Whether this draws its own reading column. The live slot on the canvas has none; a filed
   * turn in the thread already sits in one, and a second column inside it indented the row 27px
   * past the answer it introduces (measured on the conversation harness).
   */
  inColumn?: boolean;
  trail: ActivityTrail;
  /** Whether real sites are behind the step, which is what earns the globe. Live only. */
  web?: boolean;
}) {
  const [opened, setOpened] = useState<boolean | null>(null);
  const hasSteps = trail.steps.length > 0;
  // 🔴 A TURN THAT HAS DONE NOTHING NAMED YET DRAWS THE CAPTION IT ALWAYS DREW: the forming lines
  // or the milestone, with the sites and the app mark. Nothing here is lost for a turn that
  // answers from its own head, and the list appears the moment a first step lands.
  if (live && !hasSteps && !trail.plan) return <CanvasThinkingPreview app={app} domains={domains} label={label} web={web} />;
  if (!live && !hasSteps) return null;
  const open = opened ?? live;
  const running = trail.steps.some((step) => "done" in step && !step.done);
  const summary = activitySummary(trail.steps);

  return (
    <div className={cn("pb-2", inColumn && "mx-auto w-full max-w-(--canvas-column) px-6")} data-activity-trail={live ? "live" : "done"}>
      {/* 🔴 THE PLAN, IN THE ANSWER'S OWN TYPE, because it is the first thing the answer says. */}
      {trail.plan ? (
        <p className="mb-[12px] text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)" data-activity-plan="">
          {trail.plan}
        </p>
      ) : null}
      {hasSteps || label ? (
        <button
          aria-expanded={open}
          className="flex max-w-full items-center gap-[8px] rounded-[6px] text-left text-[length:var(--canvas-text-body)] leading-[24px] text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-secondary)"
          data-activity-summary=""
          onClick={() => setOpened(!open)}
          type="button"
        >
          <LeadMark steps={trail.steps} />
          {/* 🔴 LIVE, THE ROW SAYS WHAT HAS BEEN DONE SO FAR AND LIGHTS UP; done, it says what was
              done and how long it took, and sits still. */}
          <span className={cn("min-w-0 truncate", live && running && "canvas-thinking-word")}>
            {summary || (live ? (label ?? "Working") : "")}
          </span>
          {!live && trail.seconds > 0 ? (
            <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">· {workedForLabel(trail.seconds).replace(/^Worked for /, "")}</span>
          ) : null}
          <Icon aria-hidden className={cn("shrink-0 transition-transform", open && "rotate-90")} name="chevron-right" size={16} />
        </button>
      ) : null}
      {open ? (
        // 🔴 THE LINES BREATHE (owner, 2026-09-03: *"the thing under it just doesn't look well
        // spaced"*): 10px under the row, 6px between, on a 22px line, flush with the words.
        <ul className="m-0 mt-[10px] flex list-none flex-col gap-[6px] p-0 text-[length:var(--canvas-text-small)] leading-[22px] text-(--ui-text-tertiary)">
          {trail.steps.map((step) => (
            <li className="flex min-w-0 items-start gap-[8px]" key={step.id}>
              <span className="mt-[3px] flex size-[16px] shrink-0 items-center justify-center">
                <StepMark step={step} />
              </span>
              <span className="min-w-0">
                <span className={cn("done" in step && !step.done && "canvas-thinking-word")}>{stepLabel(step)}</span>
                {/* 🔴 THE SITES, AS THEIR FAVICONS, AFTER THE QUERY. ChatGPT draws the favicon of
                    the page beside the step; ours read several pages per search, so the hosts
                    follow the sentence and do not shimmer: a page already read is a settled fact. */}
                {step.kind === "search" && step.sites.length > 0 ? (
                  <span className="mt-[2px] block">
                    <DomainChips domains={step.sites} max={4} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
          {/* 🔴 THE CAPTION'S OWN LINE, LAST, WHILE NOTHING NAMED IS RUNNING: the model's milestone
              for this stage, lit. It is the sentence the turn would otherwise have shown alone. */}
          {live && !running && label ? (
            <li className="flex min-w-0 items-start gap-[8px]">
              <span className="mt-[3px] flex size-[16px] shrink-0 items-center justify-center">
                <Icon aria-hidden className="text-(--ui-text-quaternary)" name="sparkle" size={14} />
              </span>
              <span className="canvas-thinking-word">{label.replace(/…$/, "")}</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** The mark at the head of the row: the first app's logo, else the globe, else the file. */
function LeadMark({ steps }: { steps: readonly ActivityStep[] }) {
  const app = steps.find((step): step is Extract<ActivityStep, { kind: "app" }> => step.kind === "app" && Boolean(step.appKey));
  const logo = app?.appKey ? logoFor(app.appKey) : null;
  // eslint-disable-next-line @next/next/no-img-element -- a vendored SVG, drawn at its size
  if (logo) return <img alt="" aria-hidden="true" className="size-[20px] shrink-0" height={20} src={logo} width={20} />;
  if (steps.some((step) => step.kind === "search")) return <Icon aria-hidden className="shrink-0" name="globe" size={20} />;
  if (steps.some((step) => step.kind === "read")) return <Icon aria-hidden className="shrink-0" name="doc" size={20} />;
  return <Icon aria-hidden className="shrink-0" name="sparkle" size={20} />;
}

/** The mark beside one step: the thing that did it. */
function StepMark({ step }: { step: ActivityStep }) {
  switch (step.kind) {
    case "read": {
      // 🔴 THE FILE'S OWN MARK, the one the shelf and the tab draw, so a deck reads as a deck here
      // too. Several files share the plain document glyph.
      const mark = step.titles.length === 1 ? fileMark(step.titles[0] ?? "") : null;
      return mark ? <Codicon name={mark.icon} size="14px" style={{ color: `var(${mark.tint})` }} /> : <Icon aria-hidden name="doc" size={14} />;
    }
    case "search":
      return <Icon aria-hidden name="globe" size={14} />;
    case "papers":
      return <Icon aria-hidden name="list" size={14} />;
    case "app": {
      const logo = step.appKey ? logoFor(step.appKey) : null;
      // eslint-disable-next-line @next/next/no-img-element -- a vendored SVG, drawn at its size
      return logo ? <img alt="" aria-hidden="true" className="size-[16px]" height={16} src={logo} width={16} /> : <Icon aria-hidden name="sparkle" size={14} />;
    }
    case "work":
      return <Icon aria-hidden name="compute" size={14} />;
  }
}
