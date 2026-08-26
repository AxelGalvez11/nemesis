// The 40x40 tile that stands in for an app's logo.
//
// 🔴🔴 THIS FILE USED TO SAY "WE DO NOT SHIP THIRD-PARTY LOGOS", AND THE OWNER REVERSED IT ON
// 2026-08-26: *"the plugins page still doesn't have the actual Gmail or Google app icons, the real
// ones, not just a fake one."* The old tile drew a grey lucide glyph that said what KIND of thing
// each app was (a drive, mail, a calendar, a document), and side by side with any other product's
// integrations page it read as a placeholder, because that is what it was.
//
// 🔴 HALF OF THE OLD RULE STANDS AND MUST KEEP STANDING: WE DO NOT HOTLINK. Every mark below is
// drawn here, in SVG, from the vendor's published geometry and colours. A remote `<img>` would be a
// request to a third party on every page load, plus a broken square the day that URL moves, plus a
// beacon telling Google which of our users opened this page. None of that is worth a logo.
//
// 🔴 AND AN UNKNOWN APP STILL GETS A TILE. The connectable list lives in `/api/composio` and is the
// owner's to grow; a mark map that only covers today's four would draw an empty box for the fifth.
// Anything unmapped falls back to the app's first letter, which is never blank and never wrong.
//
// 🔴 A REAL MARK GETS NO CHROME, AND THAT IS NOT A STYLE PREFERENCE. Each of these logos is drawn
// on its own transparent ground and carries its own silhouette; sitting it inside a grey rounded
// square with a hairline would frame someone else's mark in our furniture, which is both uglier and
// the thing brand guidelines actually ask you not to do. The neutral tile stays for the fallback
// letter, which needs a shape of its own precisely because it has none.
//
// Size is fixed at 40px because the measured reference uses 40x40 in BOTH places this appears: the
// "Connected" strip at the top of the page and every row of the app grid.

/** The measured reference's app icon: 40x40, rounded about 10px. */
export const PLUGIN_ICON_PX = 40;

/**
 * 🔴 THE MARKS ARE KEYED BY THE SLUG THE SERVER SENDS, not by label. Labels are display copy and
 * can be reworded ("Google Drive" to "Drive") without anybody thinking about this file; the slug is
 * the identifier the connect and disconnect calls already travel on.
 *
 * 🔴 `viewBox` DIFFERS PER MARK ON PURPOSE. Each logo is drawn in the coordinate space its own
 * geometry is published in rather than being re-fitted to a shared grid, because re-fitting by hand
 * is how a logo ends up subtly wrong in a way nobody can name but everybody sees.
 */
function GoogleDrive() {
  return (
    <svg aria-hidden="true" height="30" viewBox="0 0 87.3 78" width="30" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

function Gmail() {
  return (
    <svg aria-hidden="true" height="28" viewBox="0 0 52 40" width="28" xmlns="http://www.w3.org/2000/svg">
      <path d="m3.545 39.5h8.273v-20.091l-11.818-8.864v25.409c0 1.962 1.59 3.546 3.545 3.546z" fill="#4285f4" />
      <path d="m40.182 39.5h8.273c1.961 0 3.545-1.59 3.545-3.546v-25.409l-11.818 8.864z" fill="#34a853" />
      <path d="m40.182 3.955v15.454l11.818-8.864v-4.818c0-4.383-5.003-6.881-8.509-4.25z" fill="#fbbc04" />
      <path d="m11.818 19.409v-15.454l14.182 10.636 14.182-10.636v15.454l-14.182 10.636z" fill="#ea4335" />
      <path d="m0 6.545v4.818l11.818 8.864v-15.454l-3.309-2.478c-3.506-2.631-8.509-.133-8.509 4.25z" fill="#c5221f" />
    </svg>
  );
}

function GoogleCalendar() {
  return (
    <svg aria-hidden="true" height="30" viewBox="0 0 200 200" width="30" xmlns="http://www.w3.org/2000/svg">
      <path d="m152.6 47.4h-105.2v105.2h105.2z" fill="#fff" />
      <path d="m152.6 200 47.4-47.4h-47.4z" fill="#ea4335" />
      <path d="m200 47.4h-47.4v105.2h47.4z" fill="#fbbc04" />
      <path d="m152.6 152.6h-105.2v47.4h105.2z" fill="#34a853" />
      <path d="m0 152.6v33.7c0 7.6 6.1 13.7 13.7 13.7h33.7v-47.4z" fill="#188038" />
      <path d="m200 47.4v-33.7c0-7.6-6.1-13.7-13.7-13.7h-33.7v47.4z" fill="#1967d2" />
      <path d="m13.7 0c-7.6 0-13.7 6.1-13.7 13.7v138.9h47.4v-105.2h105.2v-47.4z" fill="#4285f4" />
      <path d="m68.9 129.3c-3.9-2.7-6.7-6.6-8.2-11.8l9.1-3.8c.8 3.2 2.3 5.7 4.4 7.5 2.1 1.8 4.6 2.6 7.6 2.6 3 0 5.6-.9 7.8-2.8s3.3-4.2 3.3-7.1c0-2.9-1.2-5.3-3.5-7.2s-5.2-2.8-8.6-2.8h-5.3v-9h4.7c3 0 5.4-.8 7.5-2.4 2-1.6 3-3.8 3-6.6 0-2.5-.9-4.5-2.7-6s-4.1-2.2-6.9-2.2c-2.7 0-4.9.7-6.5 2.2-1.6 1.5-2.8 3.3-3.5 5.4l-9 -3.8c1.2-3.4 3.4-6.4 6.6-9s7.3-3.9 12.3-3.9c3.7 0 7 .7 9.9 2.1 2.9 1.4 5.2 3.4 6.9 5.9 1.7 2.5 2.5 5.3 2.5 8.4 0 3.2-.8 5.9-2.3 8.1s-3.4 3.9-5.7 5.1v.5c3 1.2 5.4 3.1 7.3 5.7 1.9 2.6 2.8 5.6 2.8 9.1s-.9 6.7-2.7 9.4c-1.8 2.8-4.3 4.9-7.4 6.5-3.2 1.6-6.7 2.4-10.6 2.4-4.6 0-8.8-1.3-12.7-4z" fill="#4285f4" />
      <path d="m112.4 79.5-9.9 7.2-5-7.6 17.8-12.8h6.8v60.5h-9.7z" fill="#4285f4" />
    </svg>
  );
}

function GoogleDocs() {
  return (
    <svg aria-hidden="true" height="32" viewBox="0 0 47 65" width="32" xmlns="http://www.w3.org/2000/svg">
      <path d="m29.375 0h-24.5c-2.681 0-4.875 2.194-4.875 4.875v55.25c0 2.681 2.194 4.875 4.875 4.875h37.25c2.681 0 4.875-2.194 4.875-4.875v-42.5z" fill="#4285f4" />
      <path d="m29.375 0v13.625c0 2.694 2.181 4.875 4.875 4.875h12.75z" fill="#a1c2fa" />
      <path d="m11.375 46.75h24.25v-3.25h-24.25zm0-8.125h24.25v-3.25h-24.25zm0-11.375v3.25h24.25v-3.25z" fill="#f1f1f1" />
    </svg>
  );
}

const MARKS: Readonly<Record<string, () => React.JSX.Element>> = {
  googlecalendar: GoogleCalendar,
  googledocs: GoogleDocs,
  googledrive: GoogleDrive,
  gmail: Gmail,
};

export function PluginIcon({ appKey, label }: { appKey: string; label: string }) {
  const Mark = MARKS[appKey];
  return (
    <span
      aria-hidden="true"
      className={
        Mark
          ? "flex h-[40px] w-[40px] shrink-0 items-center justify-center"
          : "flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px] bg-(--ui-bg-tertiary) text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-tertiary) ring-inset"
      }
    >
      {Mark ? <Mark /> : <span className="text-[16px] font-medium leading-none">{label.trim().charAt(0).toUpperCase()}</span>}
    </span>
  );
}
