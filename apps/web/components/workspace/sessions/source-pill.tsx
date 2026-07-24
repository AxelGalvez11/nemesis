"use client";

// The ChatGPT-style inline source pill: a favicon + short name sitting in the
// prose, that pops a small glass card on hover/focus showing each backing
// source's name, title and snippet.
//
// Grouping (which sources land in one pill) and href parsing live in the pure,
// tested chat-citations.ts — this component only paints what it's handed, so it
// stays thin and out of the test runner's way.

import * as React from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/desktop-ui/hover-card";
import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";
import { cn } from "@/lib/utils";

/** Structurally identical to CitationSource / SessionSource. Declared locally so
 *  source-pill and chat-markdown don't form an import cycle. */
export interface PillSource {
  title: string;
  url: string;
  description?: string;
}

/** Small round favicon; a broken/blocked icon just renders empty (no key, no
 *  CORS) so we never leave a broken-image glyph in the prose. */
function Favicon({ host, className }: { host: string | null; className?: string }) {
  if (!host) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
    <img alt="" className={cn("shrink-0 rounded-full", className)} src={faviconUrl(host)} />
  );
}

export function SourcePill({ sources }: { sources: ReadonlyArray<PillSource> }) {
  // Controlled so a touch tap can force the card open: coarse pointers never
  // fire hover, and radix suppresses touch-open by design, so without this the
  // card would be unreachable on a phone/tablet. Mouse hover + keyboard focus
  // still funnel through onOpenChange untouched.
  const [open, setOpen] = React.useState(false);

  const first = sources[0];
  if (!first) return null;

  const firstHost = hostnameOf(first.url);
  const label = sourceLabel(first.url) ?? firstHost ?? first.title;
  const extra = sources.length - 1;
  const ariaLabel = extra > 0 ? `${label} and ${extra} more source${extra > 1 ? "s" : ""}` : `Source: ${label}`;

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger asChild>
        <a
          // aria-label replaces the native title we deliberately dropped (the OS
          // tooltip would fire alongside this card), and spells out "+n" which
          // is opaque to a screen reader.
          aria-label={ariaLabel}
          className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-1.5 py-px align-baseline text-[0.78em] font-medium text-(--ui-text-secondary) no-underline hover:bg-(--ui-control-hover-background)"
          href={first.url}
          onPointerDown={(event) => {
            // pointerdown fires on touch independently of the mouse-compat
            // click suppression, and radix attaches no onPointerDown of its own,
            // so this composes cleanly and gives touch a guaranteed open.
            if (event.pointerType !== "mouse") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Favicon className="size-3" host={firstHost} />
          {label}
          {extra > 0 && <span className="text-(--ui-text-tertiary)">+{extra}</span>}
        </a>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top">
        <div className="flex flex-col gap-2.5">
          {sources.map((source, index) => {
            const host = hostnameOf(source.url);
            const name = sourceLabel(source.url) ?? host;
            return (
              <a
                className={cn(
                  "group flex flex-col gap-1 no-underline",
                  // A hairline divider between stacked sources, echoing ChatGPT's
                  // grouped card.
                  index > 0 && "border-t border-(--ui-stroke-tertiary) pt-2.5",
                )}
                href={source.url}
                key={`${source.url}-${index}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-(--ui-text-tertiary)">
                  <Favicon className="size-3.5" host={host} />
                  <span className="truncate">{name}</span>
                </span>
                <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-(--ui-text-primary) group-hover:underline">
                  {source.title || host || source.url}
                </span>
                {source.description && (
                  <span className="line-clamp-3 text-[12px] leading-snug text-(--ui-text-secondary)">
                    {source.description}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
