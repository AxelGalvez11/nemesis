// The 40x40 tile that stands in for an app's logo.
//
// 🔴 WE DO NOT SHIP THIRD-PARTY LOGOS, AND WE DO NOT HOTLINK THEM EITHER. Google's marks are
// Google's, this repo has no licensed copy of them, and a remote `<img>` would be a request to a
// third party on every page load plus a broken square the day that URL moves. Neither is worth a
// prettier row. So the tile is honestly ours: a neutral rounded square carrying a lucide glyph
// that says what KIND of thing the app is (a drive, mail, a calendar, a document).
//
// 🔴 AND AN UNKNOWN APP STILL GETS A TILE. The connectable list lives in `/api/composio` and is
// the owner's to grow; a glyph map that only covers today's four would draw an empty box for the
// fifth. Anything unmapped falls back to the app's first letter, which is never blank and never
// wrong.
//
// Size is fixed at 40px because the measured reference uses 40x40 in BOTH places this appears:
// the "Connected" strip at the top of the page and every row of the app grid.

import { CalendarDays, FileText, HardDrive, Mail, type LucideIcon } from "lucide-react";

/**
 * Composio toolkit slug to the glyph that fits it.
 *
 * 🔴 KEYED BY THE SLUG THE SERVER SENDS, not by label. Labels are display copy and can be
 * reworded ("Google Drive" to "Drive") without anybody thinking about this file; the slug is the
 * identifier the connect and disconnect calls already travel on.
 */
const GLYPHS: Readonly<Record<string, LucideIcon>> = {
  googlecalendar: CalendarDays,
  googledocs: FileText,
  googledrive: HardDrive,
  gmail: Mail,
};

/** The measured reference's app icon: 40x40, rounded about 10px. */
export const PLUGIN_ICON_PX = 40;

export function PluginIcon({ appKey, label }: { appKey: string; label: string }) {
  const Glyph = GLYPHS[appKey];
  return (
    <span
      aria-hidden="true"
      className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-(--ui-bg-tertiary) text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary) ring-inset"
    >
      {Glyph ? (
        <Glyph size={20} strokeWidth={1.6} />
      ) : (
        <span className="text-[16px] font-medium leading-none">{label.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
