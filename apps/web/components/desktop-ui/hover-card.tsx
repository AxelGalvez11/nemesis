"use client";

import { HoverCard as HoverCardPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

// Themed glass card that pops on hover/focus — the surface behind the ChatGPT-
// style source pills. Mirrors popover.tsx exactly (same glass mix, same CSS
// arrow) so citations read as part of the workspace, not a new visual language.
//
// Delays are snappy on purpose: radix defaults to 700ms open which feels broken
// for a tiny inline pill. Callers can still override.

function HoverCard({ openDelay = 120, closeDelay = 80, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root closeDelay={closeDelay} data-slot="hover-card" openDelay={openDelay} {...props} />;
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  align = "center",
  // Keeps the arrow clear of the rounded corners: radix clamps the arrow this
  // far from each edge and shifts the card to compensate.
  arrowPadding = 12,
  children,
  className,
  collisionPadding = 8,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    // Portal: the prose container and the message row both set overflow-hidden,
    // which would clip an in-tree card. data-workspace: the --ui-*/--popover
    // theme vars are scoped under the workspace root, and the portal escapes
    // that subtree — without this the card renders with unresolved colours.
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        arrowPadding={arrowPadding}
        className={cn(
          "z-50 w-72 origin-(--radix-hover-card-content-transform-origin) rounded-lg border border-(--ui-stroke-secondary) bg-[var(--popover-surface)] p-3 text-popover-foreground shadow-lg backdrop-blur-md outline-hidden data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [--popover-surface:color-mix(in_srgb,var(--ui-bg-elevated)_92%,transparent)]",
          className,
        )}
        collisionPadding={collisionPadding}
        data-slot="hover-card-content"
        data-workspace=""
        sideOffset={sideOffset}
        {...props}
      >
        {children}
        {/* CSS arrow that inherits the surface: a rotated square sharing the
            body's bg + backdrop-blur, border on its two outer edges only. */}
        <HoverCardPrimitive.Arrow asChild height={7} width={16}>
          <span className="relative block h-[7px] w-4 overflow-visible">
            <span className="absolute top-0 left-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-(--ui-stroke-secondary) bg-[var(--popover-surface)] backdrop-blur-md" />
          </span>
        </HoverCardPrimitive.Arrow>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
