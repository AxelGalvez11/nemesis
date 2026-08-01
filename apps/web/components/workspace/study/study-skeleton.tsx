"use client";

// What Study shows while it is loading.
//
// It used to say "Loading study decks…" in the middle of an empty screen. A
// centred line of text is the wrong shape: it tells you nothing about what is
// coming, and when the decks arrive the whole page jumps as the layout is
// replaced. This draws the table that is about to exist — same width, same
// rounded card, same column grid, same row height — so the arrival is a fill,
// not a jump.
//
// THE COLUMN TEMPLATE AND ROW PADDING ARE COPIED FROM THE REAL TABLE in
// cards-tab.tsx and must stay in step with it. If they drift, the page still
// works; it just flinches when the data lands, which is the exact thing this
// exists to prevent.

import { Skeleton } from "@/components/ui/skeleton";

/** Enough rows to fill the eye without pretending to know how many decks a
 *  student has. Four is roughly a screen and reads as "a list", where one or
 *  two read as "nearly empty" and would be a small lie. */
const ROWS = 4;

/** Varied widths so it reads as a list of names rather than a barcode. Fixed,
 *  not random: a skeleton that reshuffles on every render draws attention to
 *  itself, which is the opposite of the job. */
const NAME_WIDTHS = ["11rem", "14rem", "9rem", "12.5rem"];

export function StudyTableSkeleton() {
  return (
    <div aria-hidden className="scrollbar-study flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6">
      {/* The Add / Browse pill. */}
      <div className="mx-auto mb-4 mt-2 flex shrink-0 items-center gap-2 rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <Skeleton className="h-7 w-16 rounded-xl" />
        <Skeleton className="h-7 w-20 rounded-xl" />
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
        {/* The header is REAL TEXT, not bars. It is known before the data
            arrives, and showing what is known beats greying it out. */}
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold text-muted-foreground">
          <span className="pl-[19px]">Deck</span>
          <span className="text-center">New</span>
          <span className="text-center">Learn</span>
          <span className="text-center">Due</span>
          <span />
        </div>
        <div className="py-1.5">
          {NAME_WIDTHS.slice(0, ROWS).map((width) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center px-5 py-2.5"
              key={width}
            >
              <span className="pl-[19px]"><Skeleton className="h-3.5" style={{ width }} /></span>
              <span className="grid place-items-center"><Skeleton className="h-3.5 w-4" /></span>
              <span className="grid place-items-center"><Skeleton className="h-3.5 w-4" /></span>
              <span className="grid place-items-center"><Skeleton className="h-3.5 w-4" /></span>
              <span />
            </div>
          ))}
        </div>
      </div>

      {/* Said once, quietly, under the shape. Someone on a slow connection
          should be able to tell this is loading rather than broken, and a
          screen reader gets this line instead of a wall of empty boxes. */}
      <p className="mt-4 text-center text-xs text-muted-foreground" role="status">
        Loading your decks…
      </p>
    </div>
  );
}
