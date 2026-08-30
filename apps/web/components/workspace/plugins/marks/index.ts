// The slugs that have a real brand mark, and nothing else.
//
// 🔴 A CLOSED MAP, MATCHING THE ROUTE'S CLOSED APP LIST. `/api/composio`'s `APPS` constant is the
// only source of which apps exist at all (see plugins-page.tsx's header for why this codebase
// never keeps a second copy of that list). This map only needs to cover what that list contains
// today. An app that shows up here later without a drawn mark is not a bug: `plugin-icon.tsx`
// falls back to the app's first letter for exactly that case, which is never blank and never
// wrong, so nobody is blocked on someone finding time to add a fifth mark.
//
// 🔴 KEYED BY THE SAME SLUG THE SERVER SENDS, for the same reason the glyph map this replaced
// was: the slug is the identifier the connect and disconnect calls already travel on, and it never
// changes when the owner rewords a label from "Drive" to "Google Drive".

import type { ComponentType } from "react";

import { GmailMark } from "./gmail-mark";
import { GoogleCalendarMark } from "./google-calendar-mark";
import { GoogleDocsMark } from "./google-docs-mark";
import { GoogleDriveMark } from "./google-drive-mark";

export type BrandMark = ComponentType<{ size?: number }>;

export const MARKS: Readonly<Record<string, BrandMark>> = {
  gmail: GmailMark,
  googlecalendar: GoogleCalendarMark,
  googledocs: GoogleDocsMark,
  googledrive: GoogleDriveMark,
};

/**
 * Offered apps that are knowingly on the letter tile, and why each is still there.
 *
 * 🔴🔴 THIS LIST EXISTS SO THE GAP IS A DECISION RATHER THAN AN OVERSIGHT. `plugin-icon.test.ts`
 * requires every app `/api/composio` offers to appear either here or in `MARKS`, so a tenth app
 * cannot quietly ship on a letter tile because nobody looked. Being on this list is a statement
 * that someone chose it.
 *
 * 🔴🔴 AND THE REASON IS NOT "NOBODY GOT AROUND TO IT". Drawing these by hand is the one approach
 * this surface has already ruled out. The four marks above went through THREE rounds of redrawing
 * by eye, each an honest improvement, all three rejected, and the resolution recorded in
 * `plugin-icon.test.ts` was to stop approximating and reproduce the published geometry. The four
 * Google files in `public/brand/google` came from Google's own CDN byte-for-byte under written
 * provenance rules. Microsoft, Notion and Zoom publish their marks under their own brand terms,
 * and each needs fetching and licence-checking the same way, which is the owner's call to make
 * rather than something to approximate in the meantime.
 *
 * A letter tile is never blank and never wrong. A logo drawn from memory is wrong in a way nobody
 * can name and everybody sees.
 */
export const AWAITING_MARK: readonly string[] = [
  "canvas",
  "google_classroom",
  "one_drive",
  "outlook",
  "googlesheets",
  "notion",
  "zoom",
];
