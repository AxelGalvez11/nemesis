"use client";

// The pages behind an answer, shown as what they SAY rather than where they live.
//
// 🔴 MEASURED OFF CHATGPT, 2026-08-20, at the owner's request. Its answer ends in a horizontal
// carousel: a thumbnail, the publisher's favicon and name, the headline, and how recent it is,
// with an arrow to scroll. Ours ended in a wrapping row of DOMAIN NAMES — and on a broad question
// that was ten pills reading "Cnbc", "Cnbc", "Businessinsider", with nothing to tell them apart.
// The headline is the thing that distinguishes them, and it was the one thing not being shown.
//
// 🔴🔴 NO THUMBNAIL AND NO "TODAY", BECAUSE THIS SEARCH DOES NOT RETURN THEM AND I WILL NOT INVENT
// THEM. Brave's `llm/context` endpoint gives `{title, url, description}` — pre-extracted page
// chunks, which is what a model reading the result needs and is deliberately not a news feed. A
// date guessed from the text, or a thumbnail scraped from the page, would be a claim about
// freshness this product cannot stand behind. What is shown is what is known: who published it and
// what it says. Adding the other two means changing the search endpoint, which is a separate
// decision with its own cost.
//
// 🔴 A SCROLLER, NOT A WRAP. The owner asked for no cap on web search, so ten results is the
// ordinary case now. Ten cards stacked would push the composer off the screen; ten cards in a row
// that scrolls is the reference's own answer to the same problem.

import { faviconUrl, hostnameOf, sourceLabel } from "@/lib/favicon";

export interface SourceCard {
  title: string;
  url: string;
}

/** 14px, matching every other favicon on this surface. Written in px because every rem here is
 *  1.125x its number. */
const FAVICON_PX = 14;

export function CanvasSourceCards({ cards, onAdd }: { cards: readonly SourceCard[]; onAdd?: (url: string) => void }) {
  if (cards.length === 0) return null;

  return (
    <div
      className="mt-3 flex gap-2 overflow-x-auto pb-1"
      // 🔴 THE ROW SCROLLS, THE PAGE DOES NOT. Without this the canvas column itself grows a
      // horizontal scrollbar, which is the one thing a reading surface must never do.
      style={{ scrollbarWidth: "thin" }}
    >
      {cards.map((card) => {
        const host = hostnameOf(card.url);
        const publisher = sourceLabel(card.url) ?? host ?? "";
        return (
          <div
            className="flex w-[220px] shrink-0 flex-col gap-1.5 rounded-xl bg-(--ui-bg-elevated) p-3 ring-1 ring-(--ui-stroke-tertiary)"
            key={card.url}
          >
            <div className="flex items-center gap-1.5">
              {host && (
                // eslint-disable-next-line @next/next/no-img-element -- remote favicon service, not a static asset.
                <img alt="" className="shrink-0 rounded-full" height={FAVICON_PX} src={faviconUrl(host)} width={FAVICON_PX} />
              )}
              <span className="truncate text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{publisher}</span>
              {onAdd && (
                // 🔴 THE PROMOTE CONTROL SURVIVES THE REDESIGN. Pressing `+` is the separate,
                // explicit act of KEEPING a page — the "distinct temporary versus durable" rule the
                // pill row carried. Losing it here would have quietly removed the only way to turn
                // a cited page into a source of this canvas.
                <button
                  aria-label={`Add ${publisher || card.url} to sources`}
                  className="ml-auto flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() => onAdd(card.url)}
                  title="Add to sources"
                  type="button"
                >
                  <svg fill="none" height="9" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 12 12" width="9">
                    <path d="M6 1.5v9M1.5 6h9" />
                  </svg>
                </button>
              )}
            </div>
            {/* 🔴 THE HEADLINE IS THE POINT, AND IT IS CLAMPED RATHER THAN TRUNCATED TO ONE LINE.
                Three lines is enough for a real headline to be recognised; one line turns most of
                them into an ellipsis, which is the domain-pill problem in a taller box. */}
            <a
              className="line-clamp-3 text-[length:var(--canvas-text-small)] leading-snug text-(--ui-text-primary) no-underline hover:underline"
              href={card.url}
              rel="noopener noreferrer"
              target="_blank"
              title={card.title}
            >
              {card.title}
            </a>
          </div>
        );
      })}
    </div>
  );
}
