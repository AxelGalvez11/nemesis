// The 40x40 tile that stands in for an app's logo.
//
// 🔴 NO HOTLINKING, EVER. A remote `<img>` pointed at a third party's own servers would be a
// request to them on every page load, a broken square the day that address moves, and a beacon
// telling that third party which of our users opened this page. None of it is worth a prettier
// row, so every mark below is inline SVG in this repo's own source: nothing fetched at runtime,
// nothing shipped as a binary asset. The shapes live in `marks/`, one file per app.
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
// the owner's to grow; a mark map that only covers today's four would draw an empty box for the
// fifth. Anything unmapped falls back to the app's first letter, which is never blank and never
// wrong.
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

  return (
    <span
      aria-hidden="true"
      className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-(--ui-bg-tertiary) text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary) ring-inset"
    >
      <span className="text-[16px] font-medium leading-none">{label.trim().charAt(0).toUpperCase()}</span>
    </span>
  );
}
