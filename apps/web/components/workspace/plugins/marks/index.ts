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
