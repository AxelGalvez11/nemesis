"use client";

// The Chat | Canvas switch at the top of the start screen.
//
// Measured on chatgpt.com's Chat | Work control in the owner's signed-in Chrome, 2026-09-03:
// track 228.6 × 36 at y = 8, centred, fully rounded, bg rgb(33,33,33) in dark; two radio buttons
// 114.3 × 36, padding 8/44 outer and 8/36 inner, 14px / 500 / 20px; the active half carries a
// raised pill (rgb(27,27,27), 123 × 37, radius full) and white text, the other rgb(205,205,205).
// Ours draws the same geometry on our tokens.
//
// 🔴 THE TRACK IS A FIXED 228px OF TWO EQUAL HALVES, NOT PADDING AROUND THE LABELS. Copying the
// reference's 8/44 and 8/36 insets literally is what shipped first, and "Canvas" is six letters
// where "Work" is four: an equal-column grid takes the wider half twice, and the control measured
// 256 on production, 27px past the thing it was copied from. Labels centre inside their half.
//
// 🔴 IT IS A NAVIGATION, NOT A MODE. "Chat" is /learn (the front door), "Canvas" is /canvas (an
// empty board). Each page shows the switch with its own half lit; a saved board (/canvas/<id>)
// shows no switch, the same way a chat in progress shows none.
//
// 🔴 THE SWITCH ANIMATES ACROSS THE NAVIGATION (owner 2026-09-03: "add animation to switching to
// and from chat and canvas"). Watched on chatgpt.com: the thumb slides (a transform, ~200ms) and
// the start screen below it is replaced, the composer easing 38px into its new place. Two routes
// cannot share one element, so the motion is in two halves that meet: the leaving page fades its
// content (not the switch) for 150ms before the push, and the arriving page mounts its switch
// with the thumb still on the OLD side and lets it slide, while the content fades in from 6px
// below. The hand-off rides sessionStorage, so a plain visit or a reload plays nothing.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import "./front-door.css";

export type FrontDoorMode = "chat" | "canvas";

const OPTIONS: ReadonlyArray<{ id: FrontDoorMode; label: string; href: string }> = [
  { id: "chat", label: "Chat", href: "/learn" },
  { id: "canvas", label: "Canvas", href: "/canvas" },
];

const HANDOFF_KEY = "nemesis:front-door-switch";
/** The leaving page's fade, before the route changes. Matches `front-door-leave` in board.css. */
const LEAVE_MS = 150;

/** Which door the learner just left, if this mount is the far side of a switch. */
function readHandoff(): FrontDoorMode | null {
  try {
    const from = window.sessionStorage.getItem(HANDOFF_KEY);
    window.sessionStorage.removeItem(HANDOFF_KEY);
    return from === "chat" || from === "canvas" ? from : null;
  } catch {
    return null;
  }
}

export function FrontDoorToggle({ value, className }: { value: FrontDoorMode; className?: string }) {
  const router = useRouter();
  // The thumb's side. On the far side of a switch it starts where it was and slides to `value`.
  const [side, setSide] = useState<FrontDoorMode>(value);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const from = readHandoff();
    const page = document.querySelector<HTMLElement>("[data-front-door-page]");
    if (from && from !== value) {
      setSide(from);
      page?.setAttribute("data-front-door-entering", "");
      const frame = window.requestAnimationFrame(() => setSide(value));
      const done = window.setTimeout(() => page?.removeAttribute("data-front-door-entering"), 400);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(done);
      };
    }
    setSide(value);
    return undefined;
  }, [value]);

  const go = (option: (typeof OPTIONS)[number]) => {
    if (option.id === value || leaving) return;
    setLeaving(true);
    setSide(option.id);
    try {
      window.sessionStorage.setItem(HANDOFF_KEY, value);
    } catch {
      /* a private window with storage off simply plays no entrance */
    }
    const page = document.querySelector<HTMLElement>("[data-front-door-page]");
    page?.setAttribute("data-front-door-leaving", "");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => router.push(option.href), reduced ? 0 : LEAVE_MS);
  };

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-[8px] z-40 flex justify-center", className)} data-front-door-toggle-host="">
      <div
        aria-label="Start a chat or a canvas"
        className="pointer-events-auto relative grid h-[36px] w-[228px] grid-cols-2 rounded-full bg-(--ui-bg-secondary)"
        data-front-door-toggle=""
        role="radiogroup"
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[-0.5px] h-[37px] w-[123px] rounded-full bg-(--ui-bg-elevated) shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-[left] duration-200 ease-out motion-reduce:transition-none",
            side === "chat" ? "left-[-0.5px]" : "left-[calc(100%-122.5px)]",
          )}
        />
        {OPTIONS.map((option) => {
          const active = option.id === side;
          return (
            <button
              aria-checked={option.id === value}
              className={cn(
                "relative z-[1] h-[36px] whitespace-nowrap rounded-full text-center text-[14px] font-medium leading-[20px] transition-colors duration-200",
                active ? "text-foreground" : "text-(--ui-text-secondary) hover:text-foreground",
              )}
              key={option.id}
              onClick={() => go(option)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
