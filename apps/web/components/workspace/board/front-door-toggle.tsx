"use client";

// The Chat | Canvas switch at the top of the start screen.
//
// Measured on chatgpt.com's Chat | Work control in the owner's signed-in Chrome, 2026-09-03:
// track 228.6 × 36 at y = 8, centred, fully rounded, bg rgb(33,33,33) in dark; two radio buttons
// 114.3 × 36, padding 8/44 outer and 8/36 inner, 14px / 500 / 20px; the active half carries a
// raised pill (rgb(27,27,27), 123 × 37, radius full) and white text, the other rgb(205,205,205).
// Ours draws the same geometry on our tokens.
//
// 🔴 IT IS A NAVIGATION, NOT A MODE. "Chat" is /learn (the front door), "Canvas" is /canvas (an
// empty board). Each page shows the switch with its own half lit; a saved board (/canvas/<id>)
// shows no switch, the same way a chat in progress shows none.

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type FrontDoorMode = "chat" | "canvas";

const OPTIONS: ReadonlyArray<{ id: FrontDoorMode; label: string; href: string }> = [
  { id: "chat", label: "Chat", href: "/learn" },
  { id: "canvas", label: "Canvas", href: "/canvas" },
];

export function FrontDoorToggle({ value, className }: { value: FrontDoorMode; className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-[8px] z-40 flex justify-center", className)}>
      <div
        aria-label="Start a chat or a canvas"
        className="pointer-events-auto relative grid h-[36px] grid-cols-2 rounded-full bg-(--ui-bg-secondary)"
        data-front-door-toggle=""
        role="radiogroup"
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[-0.5px] h-[37px] w-[123px] rounded-full bg-(--ui-bg-elevated) shadow-[0_1px_2px_rgb(0_0_0/0.08)] transition-[left] duration-200 ease-out motion-reduce:transition-none",
            value === "chat" ? "left-[-4px]" : "left-[calc(100%-119px)]",
          )}
        />
        {OPTIONS.map((option) => {
          const active = option.id === value;
          return (
            <button
              aria-checked={active}
              className={cn(
                "relative z-[1] h-[36px] whitespace-nowrap rounded-full text-[14px] font-medium leading-[20px] transition-colors",
                option.id === "chat" ? "pl-[44px] pr-[36px]" : "pl-[36px] pr-[44px]",
                active ? "text-foreground" : "text-(--ui-text-secondary) hover:text-foreground",
              )}
              key={option.id}
              onClick={() => {
                if (!active) router.push(option.href);
              }}
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
