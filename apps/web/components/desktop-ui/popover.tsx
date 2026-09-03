"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  align = "center",
  // Keeps the arrow clear of the rounded corners: Radix clamps the arrow this
  // far from each edge and shifts the popover to compensate.
  arrowPadding = 12,
  children,
  className,
  collisionPadding = 8,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        arrowPadding={arrowPadding}
        // Themed glass surface, viewport-aware, standard open/close motion.
        //
        // 🔴🔴 z-[140], AND z-50 MEANT A POPOVER INSIDE A DIALOG WAS UNCLICKABLE.
        // `DialogContent` is z-[130] and its overlay z-[120], so a popover opened
        // from inside one rendered BEHIND the dialog that opened it — visible as
        // nothing at all, and every click on it landing on the dialog. Found on
        // screen 2026-09-03 driving the event editor's new colour picker; a diff
        // shows two numbers in two files and nothing wrong.
        //
        // 🔴 140 IS THE NUMBER ITS SIBLINGS ALREADY USE. `dropdown-menu`,
        // `context-menu` and `select` are all z-[140] for exactly this reason;
        // the popover was written before anything put one inside a dialog and
        // was the only one left below the line.
        className={cn(
          "z-[140] w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-(--ui-stroke-secondary) bg-[var(--popover-surface)] p-2 text-popover-foreground backdrop-blur-md outline-hidden data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [--popover-surface:color-mix(in_srgb,var(--ui-bg-elevated)_92%,transparent)]",
          className,
        )}
        collisionPadding={collisionPadding}
        data-slot="popover-content"
        data-workspace=""
        sideOffset={sideOffset}
        {...props}
      >
        {children}
        {/* CSS arrow that truly inherits the surface: a rotated square sharing the
            body's exact bg + backdrop-blur, border on its two outer edges only. */}
        <PopoverPrimitive.Arrow asChild height={7} width={16}>
          <span className="relative block h-[7px] w-4 overflow-visible">
            <span className="absolute top-0 left-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-(--ui-stroke-secondary) bg-[var(--popover-surface)] backdrop-blur-md" />
          </span>
        </PopoverPrimitive.Arrow>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
