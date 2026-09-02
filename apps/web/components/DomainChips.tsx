import { faviconUrl } from "@/lib/favicon";

// ── the sites a turn is reading, drawn ───────────────────────────────────────────────────────
//
// Owner 2026-08-24: *"if it's searching the web, can it also show the favicons as thumbnails when
// searching… when they're thinking preview?"* The data half shipped in #795 (`searchedDomains`,
// threaded to the dock as `domains`); this is the drawing.
//
// 🔴🔴 EVERY NUMBER BELOW WAS MEASURED OFF ChatGPT, NOT GUESSED (2026-08-24, computed styles read
// off the live page across two runs at a 50ms poll — the phase is transient and a screenshot
// arrives after it is gone). What that measurement actually settled, and what it changed:
//
//   • the icon is 12px, fully round, with a 4px gap to its label
//   • the label is 9px / weight 400 / rgb(93,93,93) — quiet, well below body text
//   • overflow is a literal "+N", not "N more"
//
// 🔴 THE ONE MEASUREMENT DELIBERATELY NOT COPIED IS THE 9px. That number is only meaningful inside
// the reference's own scale, where it sits INLINE in 16px prose as a citation. Ours sits beside a
// 14px thinking caption, and this product's scale (§46.3) stops at `--canvas-text-meta` — 12px.
// Adding a 9px step would put a size below everything else in Nemesis, which is the exact fine-print
// failure just corrected on the sidebar's section labels. So the chip takes the smallest step the
// scale actually has and keeps the RELATIONSHIP the measurement establishes: one step below the
// caption it accompanies, in the quiet tertiary grey. Matching a ratio beats matching a number
// when the two type scales are not the same scale.
//
// 🔴 THE ICON IS SIZED IN `em`, SO IT CANNOT DRIFT FROM ITS LABEL. Written as `size-3` it would be
// rem-based and would grow under the app's font-scale setting while the px-token label stayed put —
// the same mismatch just fixed on the settings controls. At `1em` the mark is always exactly as
// tall as the word beside it.
//   • the label is the publisher's DISPLAY NAME ("Time and Date", "AccuWeather", "Folha de
//     S.Paulo"), with a bare hostname as the fallback — `reuters.com` appeared in the same run
//
// 🔴🔴 AND THE LABEL IS THE BARE HOSTNAME ANYWAY, WHICH IS THE REFERENCE'S *FALLBACK* FORM ON
// PURPOSE. Display names come from a publisher database ChatGPT has and we do not. The nearest
// thing here is `sourceLabel()`, which strips `www`/`en` and title-cases what is left — and
// rendering that showed exactly why it must not be used for this: bbc.co.uk became **"Bbc"** and
// jstor.org became **"Jstor"**. Title-casing an acronym invents a misspelling of a real
// organisation's name, and it does it most often to the most recognisable sources (BBC, JSTOR,
// NASA, NIH, IEEE). A hostname is never wrong.
//
// The second reason outranks even that: the source pills and the Sources panel both label with a
// bare `hostnameOf`. A chip reading "Bbc" above a panel row reading "www.bbc.co.uk" is one site
// wearing two names on one screen. Matching the product beats matching the reference.
//
// 🔴 THE ICON IS DECORATION AND IS MARKED AS SUCH. `alt=""` plus `aria-hidden` keeps a screen
// reader from announcing a logo twice — the name is right beside it in text, which is the part
// that carries the meaning.

/** Beyond this the row stops being scannable and starts being a wall. The caller never truncates
 *  (a guard in searched-domains.test.ts enforces that), so the "+N" below is a real remainder.
 *
 *  🔴🔴 THREE, DOWN FROM SIX, AND THE SIX WAS RUNNING THROUGH THE COMPOSER. Owner, 2026-09-01, with
 *  a screenshot: *"the favicons and where it's supposed to be researching, there's a bug where it
 *  shows near the composer, it's clipping."* Reproduced on production asking his own question: a
 *  broad web search returns eight or more sites, and six chips beside a 76px character is a
 *  540px-wide row that this box has nowhere to put. The reference shows a short row and a "+N", and
 *  the "+N" is the part that was already right — it just never had to do any work at six. */
const DEFAULT_MAX = 3;

export function DomainChips({ domains, max = DEFAULT_MAX }: { domains: readonly string[]; max?: number }) {
  // 🔴 NOTHING IS THE HONEST DRAWING OF NOTHING. There is deliberately no placeholder and no
  // default list — see the note where SEARCH_DOMAINS used to live in lib/favicon.ts.
  if (domains.length === 0) return null;

  const shown = domains.slice(0, Math.max(1, max));
  const extra = domains.length - shown.length;

  return (
    // 🔴🔴 `nowrap`, AND WRAPPING IS WHAT PUT THIS THROUGH THE COMPOSER. This row is absolutely
    // positioned beside the character with only a `left`, so its width is shrink-to-fit — and
    // shrink-to-fit on a WRAPPING flex container resolves to the widest single item, not to the
    // row. Six chips therefore stacked into a 116px-wide, 185px-tall column hanging off the
    // character, and the composer starts 40px into it. Measured on production 2026-09-01: chips at
    // y 680 through 865, composer at y 824.
    //
    // A row that cannot wrap has no such collapse, and `max` above keeps it short enough that it
    // never needs to. `min-w-0` stays: it is what lets a long hostname ellipsize rather than push.
    <span className="flex min-w-0 flex-nowrap items-center gap-x-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
      {shown.map((domain) => (
        <span className="flex min-w-0 items-center gap-1" key={domain}>
          {/* 🔴🔴 EAGER, NOT LAZY — A LAZY IMAGE IN A TRANSIENT INDICATOR MAY NEVER LOAD AT ALL.
              This was `loading="lazy"`, copied in from the old component without thinking about
              where it now renders. On the dock the chips ride an absolutely-positioned box carried
              by a live transform, and in the preview that box measured at y=-339 — outside the
              viewport, so the browser deferred every icon and all four sat at `complete: false`,
              `naturalWidth: 0`, for as long as they were watched. Lazy loading is an optimisation
              for images a reader may scroll to later; these exist for a few seconds during one
              turn and then leave. If they load late they do not load. They are six 12px icons of a
              couple of KB each, already cached for a week by the route. */}
          <img
            alt=""
            aria-hidden="true"
            className="size-[1em] shrink-0 rounded-full object-contain"
            decoding="async"
            src={faviconUrl(domain)}
          />
          <span className="min-w-0 truncate">{domain}</span>
        </span>
      ))}
      {extra > 0 ? <span className="tabular-nums">+{extra}</span> : null}
    </span>
  );
}
