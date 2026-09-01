// Where each connectable app's real logo file lives, for every surface that draws one.
//
// 🔴 ONE MAP, BECAUSE THERE WERE ABOUT TO BE THREE. The front door's apps menu already carried its
// own copy covering the four Google marks; the Plugins page carried a separate map of inline React
// marks; a third would have appeared the moment anything else wanted to draw an app. Three copies
// of "which file is Outlook's" drift the moment one is edited, and the failure is silent: a row
// renders a broken square or a letter and nobody notices which map was stale.
//
// 🔴🔴 THESE ARE `<img>` SOURCES, NOT SHAPES TO INLINE, AND THE FILES THEMSELVES PROVE WHY.
// `googlesheets.svg` defines the ids `a`, `b` and `c`. `outlook.svg` defines fourteen. Five of the
// seven vendored marks point a `fill` at `url(#…)`. Inlined side by side in one document those ids
// collide and the browser resolves every `url(#a)` to whichever element came first, so Sheets
// would paint itself with another mark's gradient. An `<img>` keeps each file its own document.
// Both PROVENANCE.md files say the same thing; this is the code that depends on it.
//
// 🔴 SERVED FROM OUR OWN `public/`, NEVER THE VENDOR'S CDN. A remote `<img>` is a request to a
// third party on every page load, a beacon telling them which of our users opened the page, and a
// broken square the day they re-cut the asset.
//
// PURE. No React, no I/O.

/**
 * Keyed by the Composio toolkit slug, which is the same `key` the connect and disconnect calls
 * already travel on and the same one the server sends. It never changes when a label is reworded
 * from "Drive" to "Google Drive", and it keeps `one_drive`'s underscore.
 */
export const APP_LOGO: Readonly<Record<string, string>> = {
  // Google's own CDN, kept in public/brand/google. See that folder's PROVENANCE.md.
  gmail: "/brand/google/gmail.svg",
  googlecalendar: "/brand/google/calendar.svg",
  googledocs: "/brand/google/docs.svg",
  googledrive: "/brand/google/drive.svg",
  // The rest, in public/brand/apps. See that folder's PROVENANCE.md.
  canvas: "/brand/apps/canvas.svg",
  google_classroom: "/brand/apps/google_classroom.svg",
  googlesheets: "/brand/apps/googlesheets.svg",
  notion: "/brand/apps/notion.svg",
  one_drive: "/brand/apps/one_drive.svg",
  outlook: "/brand/apps/outlook.svg",
  zoom: "/brand/apps/zoom.svg",
};

/** The file for an app, or null when we have no artwork for it and a caller must fall back. */
export function logoFor(appKey: string): string | null {
  return APP_LOGO[appKey] ?? null;
}
