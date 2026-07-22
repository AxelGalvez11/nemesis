import type * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholders are NEUTRAL on purpose. `bg-accent` reads as the brand
 *  crimson (--accent resolves to --acid, #cc1f33), which made every sidebar
 *  loader flash red as if something had failed. */
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
