// The 40x40 tile that stands in for an app's logo.
//
// 🔴 NO HOTLINKING, EVER. A remote `<img>` pointed at a third party's own servers would be a
// request to them on every page load, a broken square the day that address moves, and a beacon
// telling that third party which of our users opened this page. None of it is worth a prettier
// row. Nothing here is fetched at runtime.
//
// 🔴🔴 "NOTHING SHIPPED AS A BINARY ASSET" USED TO BE PART OF THAT RULE AND IS NOT ANY MORE. It
// was never the rule that mattered — hotlinking is — and it could not survive the list growing
// past four. There are two tiers now:
//
//   1. `marks/` — inline SVG, one React component per app, for the four Google marks reproduced in
//      their published geometry after three rounds of not being (see below).
//   2. `public/brand/` — the vendor's own file, drawn with an `<img>` from our own origin.
//
// Tier 2 exists because these files CANNOT be inlined, and that is measured rather than assumed:
// `googlesheets.svg` defines the ids `a`, `b` and `c`, and `outlook.svg` defines fourteen. Inlined
// side by side those ids collide and every `url(#a)` resolves to whichever element came first, so
// Sheets would paint itself with another mark's gradient. The front door has drawn Google's four
// this way since #911 for exactly that reason. An `<img>` served from our own `public/` is not a
// hotlink: no third party is on the request path, and nothing breaks when a vendor re-cuts an
// asset.
//
// 🔴🔴 AND THEY ARE THE REAL MARKS, IN THEIR PUBLISHED GEOMETRY, AFTER THREE ROUNDS OF NOT BEING.
// Each of these started as a shape drawn by eye and was redrawn twice, every round a genuine
// improvement and none of them the thing being asked for. The owner said it twice, the second time
// after the redraws had shipped: *"the plugins page still doesn't have the actual Gmail or Google
// app icons, the real ones, not just a fake one."* The answer was never a better approximation. It
// was to stop approximating. Each mark is now reproduced unaltered, in its own coordinate space,
// to say "this connects to that product", which is what an integration icon is for.
//
// 🔴 AND AN UNKNOWN APP STILL GETS A TILE. The connectable list lives in `/api/composio` and is
// the owner's to grow; a map that only covers today's apps would draw an empty box for the next
// one. Anything with neither a drawn mark nor a file falls back to the app's first letter, which
// is never blank and never wrong.
//
// 🔴 A REAL MARK SITS ON A FIXED WHITE TILE, NEVER OUR THEME'S. Drive's triangle, Gmail's
// envelope and the rest are drawn assuming a white backdrop: Gmail's corners are rounded by
// clipping to a shape with nothing behind it, and Docs' text rules are white rectangles that only
// read as "white space" on an actually-white tile. Painting that tile with `--ui-bg-tertiary`
// would hand dark mode a grey-on-grey smear the moment a mark leans on a gap to read. Only the
// letter fallback keeps the theme-adaptive tile, because that ink is ours, drawn for our own
// surface, and already contrasts correctly in both themes.
//
// Size is fixed at 40px because the measured reference uses 40x40 in BOTH places this appears:
// the "Connected" strip at the top of the page and every row of the app grid.

import { APP_LOGO } from "@/lib/workspace/app-logos";

import { MARKS } from "./marks";

/** The measured reference's app icon: 40x40, rounded about 10px. */
export const PLUGIN_ICON_PX = 40;

export function PluginIcon({ appKey, label }: { appKey: string; label: string }) {
  const Mark = MARKS[appKey];

  if (Mark) {
    return (
      <span
        aria-hidden="true"
        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-white ring-1 ring-black/10 ring-inset"
      >
        <Mark size={30} />
      </span>
    );
  }

  // Tier 2: the vendor's own file, from our own origin. Same white tile as a drawn mark, for the
  // same reason — these are cut assuming a white backdrop, and several of them lean on a gap to
  // read at all.
  const src = APP_LOGO[appKey];
  if (src) {
    return (
      <span
        aria-hidden="true"
        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-white ring-1 ring-black/10 ring-inset"
      >
        {/* 🔴 EXPLICIT `width`/`height` AS WELL AS THE CLASS. Without intrinsic dimensions the row
            reflows the instant the icon decodes, which is a visible jump in a list someone is
            already reaching for.
            eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="h-[30px] w-[30px] object-contain" height={30} src={src} width={30} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-(--ui-bg-tertiary) text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary) ring-inset"
    >
      <span className="text-[16px] font-medium leading-none">{label.trim().charAt(0).toUpperCase()}</span>
    </span>
  );
}
