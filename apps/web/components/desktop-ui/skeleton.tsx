import type * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholders are NEUTRAL on purpose. `bg-accent` compiles to
 *  --dt-accent → --theme-accent-soft (#fae9eb light / #261113 dark) — a
 *  crimson tint, not a gray — so every sidebar loader flashed red as if
 *  something had failed. (Not the --accent → --acid chain in globals.css;
 *  that legacy alias is unrelated to this Tailwind utility.) */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

/** Inline pulsing chip standing in for a small count/badge while it loads. */
function CountSkeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-block h-2 w-3.5 translate-y-px animate-pulse rounded-sm bg-current/25", className)}
      data-slot="count-skeleton"
      {...props}
    />
  );
}

export { CountSkeleton, Skeleton };
