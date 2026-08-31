// The apps a learner may connect, and what each one is FOR.
//
// 🔴 A CLOSED LIST, AND THAT IS STILL DELIBERATE. Composio brokers 1,431 toolkits; offering all
// of them turns a study tool into an integrations directory, and every extra app is another OAuth
// consent screen a student clicks through without reading. So this list grows only when an app
// reaches material Nemesis has NO other route to, and each row has to say what that material is.
//
// 🔴 IT LIVES HERE, NOT IN THE ROUTE, BECAUSE TWO SURFACES NEED THE SAME FACTS. The route decides
// which slugs may be connected; the sidebar decides whether to show the Calendar destination.
// Both were reading the app catalogue, and the second one was reading it by sniffing the slug
// string for "calendar" — which is correct for `googlecalendar` and silently wrong for `outlook`,
// whose toolkit carries nine calendar actions and no such substring. Two copies of "which apps
// have a calendar" drift the moment one of them is edited, so there is one copy and it is here.
//
// 🔴 `key` IS COMPOSIO'S TOOLKIT SLUG, EXACTLY, INCLUDING ITS UNDERSCORES. `statusFor` matches a
// connected account's `toolkit.slug` against these keys, so a key that merely resembles the slug
// (`onedrive` for `one_drive`) connects successfully and then reports as never connected: the
// learner signs in, comes back, and the row still says Connect. The catalogue is the authority on
// its own names, and every key below was read off it rather than typed from memory.
//
// PURE. No React, no I/O, no network.

/** What a learner is reaching for. Groups the settings screen so nine rows read as four ideas. */
export type AppGroup = "coursework" | "files" | "mail" | "notes" | "lectures";

export interface ConnectableApp {
  /** Composio's toolkit slug, verbatim. Also derives `COMPOSIO_AUTH_<KEY>`. */
  readonly key: string;
  readonly label: string;
  /** One line, in the learner's words, about what Nemesis gains by reaching it. */
  readonly detail: string;
  readonly group: AppGroup;
  /**
   * Whether this app carries a calendar.
   *
   * 🔴 A PROPERTY OF THE APP, DECLARED, NOT INFERRED FROM ITS NAME. Outlook is mail AND calendar
   * in one toolkit; Google splits the two across two. No string test over a slug can know that,
   * and the one that was there answered "no calendar" for every Microsoft student.
   */
  readonly calendar?: true;
}

export const CONNECTABLE_APPS: readonly ConnectableApp[] = [
  // ── Coursework ─────────────────────────────────────────────────────────────────────────────
  //
  // 🔴 THIS GROUP IS FIRST BECAUSE IT IS THE ONLY ONE THAT REACHES SCHOOL ITSELF. Every other row
  // reaches a place a student happens to keep things. A learning management system holds the
  // assignments, the due dates, the rubric a piece of work will actually be marked against, and
  // the announcement that changed the deadline. Nemesis could read a student's whole drive and
  // still not know what was due on Friday.
  //
  // 🔴 LABELLED "Canvas LMS", NOT "Canvas", AND THAT IS NOT FUSSINESS. This product calls its own
  // workspace a canvas: the sidebar says "New canvas", the code says `learning-canvas`, and the
  // owner's vocabulary for the core object is that word. An app row reading plain "Canvas" would
  // collide with the product's most-used noun in the one screen where a learner is deciding what
  // to hand over access to. The slug stays `canvas` because that is Composio's name for it.
  //
  // 🔴 AND CONNECTING IT IS NOT AN "ALLOW" BUTTON. Canvas has no Composio-managed OAuth, so this
  // uses its API-key mode: the learner is asked for their own school's Canvas address and an
  // access token they generate in Canvas themselves. That is a form, not a one-click consent, so
  // the row says so rather than letting the form arrive as a surprise. Verified on the real
  // consent page 2026-08-30: it asks for exactly those two things and explains where to find both.
  { detail: "Your assignments, due dates and rubrics. Asks for your school's Canvas address and an access token you make in Canvas.", group: "coursework", key: "canvas", label: "Canvas LMS" },
  { detail: "Coursework, materials and announcements from your classes.", group: "coursework", key: "google_classroom", label: "Google Classroom" },

  // ── Files ──────────────────────────────────────────────────────────────────────────────────
  { detail: "Read lecture slides and notes you already keep there.", group: "files", key: "googledrive", label: "Google Drive" },
  // 🔴 THE GAP THIS CLOSES IS HALF THE WORLD, NOT AN EXTRA. Every app offered before this line is
  // Google's. A university on Microsoft 365 (and a great many are, whole countries' worth) gave
  // its students an account that Nemesis could reach nothing through: their files, their mail and
  // their deadlines were all behind a door with no handle. The auth config for this already
  // existed and had never been listed, so the connector was built, paid for, and invisible.
  { detail: "The same, for a school that put you on Microsoft instead of Google.", group: "files", key: "one_drive", label: "OneDrive" },

  // ── Mail and dates ─────────────────────────────────────────────────────────────────────────
  { detail: "Read your school mail, including the syllabus nobody forwards twice.", group: "mail", key: "gmail", label: "Gmail" },
  { detail: "See what is due, and put dates you mention on the calendar.", calendar: true, group: "mail", key: "googlecalendar", label: "Google Calendar" },
  // One toolkit, both jobs: 286 actions covering mail and nine covering events. Hence `calendar`.
  { detail: "School mail and your timetable together, if your school runs on Microsoft.", calendar: true, group: "mail", key: "outlook", label: "Outlook" },

  // ── Notes and documents ────────────────────────────────────────────────────────────────────
  // Added 2026-08-24 at the owner's request, after they created its auth config. Reading a shared
  // set of class notes is the same act as reading a lecture slide, so it costs no new safety
  // thinking — `riskOf` classifies by verb and has never known which app it was looking at.
  { detail: "Read notes and essays you keep there, including ones shared with you.", group: "notes", key: "googledocs", label: "Google Docs" },
  // Nemesis already parses spreadsheets it is handed; this is the same act performed where the
  // sheet actually lives. Its auth config, like OneDrive's and Outlook's, already existed.
  { detail: "Read lab results, reading lists and trackers you keep in a sheet.", group: "notes", key: "googlesheets", label: "Google Sheets" },
  // 🔴 NOT A FOURTH FILE LOCKER. A Notion page is where a student keeps the notes they WROTE, and
  // a database is where they keep a reading list or a revision plan. Neither has any other route
  // into Nemesis: they are not files anybody uploads.
  { detail: "Read your own notes, reading lists and class wikis.", group: "notes", key: "notion", label: "Notion" },

  // ── Lectures ───────────────────────────────────────────────────────────────────────────────
  // 🔴 THE ONLY ROW THAT ADDS A NEW KIND OF MATERIAL RATHER THAN A NEW ADDRESS. Everything above
  // reaches documents, which Nemesis could already read if you uploaded them. A recorded lecture
  // and its transcript are a thing a student cannot upload and has no other way to study from.
  { detail: "Reach recordings and transcripts of lectures you sat in.", group: "lectures", key: "zoom", label: "Zoom" },
];

/** Group headings, in the order the settings screen shows them. */
export const APP_GROUPS: readonly { id: AppGroup; label: string }[] = [
  { id: "coursework", label: "Coursework" },
  { id: "files", label: "Files" },
  { id: "mail", label: "Mail and dates" },
  { id: "notes", label: "Notes and documents" },
  { id: "lectures", label: "Lectures" },
];

/** Whether an offered app may be connected at all. The route's closed-list check. */
export function isOffered(key: string): boolean {
  return CONNECTABLE_APPS.some((app) => app.key === key);
}

/** The learner's own name for an app, for a confirmation card. Falls back to the raw slug. */
export function labelFor(key: string): string {
  return CONNECTABLE_APPS.find((app) => app.key === key)?.label ?? key;
}

/**
 * Whether anything this learner has connected carries a calendar.
 *
 * 🔴 THE SIDEBAR'S Calendar ROW HANGS ON THIS, and it used to hang on
 * `slug.includes("calendar")`. That reads as structural rather than as a keyword list, which is
 * why it survived review, but it is a string test standing in for a fact about a product: it
 * answers "no" for Outlook, so a Microsoft student with their whole timetable connected never saw
 * the destination that shows it. Asking the catalogue is the same question asked of something
 * that actually knows the answer.
 */
export function hasCalendar(connected: readonly string[]): boolean {
  // 🔴 CASE-INSENSITIVE, WHILE `isOffered` IS NOT, AND THE ASYMMETRY IS THE POINT. These two have
  // different jobs. `isOffered` AUTHORISES a connection and should be strict about the name it is
  // given. This one DESCRIBES what a learner already has, reading slugs that came back from
  // somebody else's API, so it should be forgiving about their casing. `sidebar-nav.test.ts` has
  // pinned that leniency since before this function existed.
  const wanted = connected.map((slug) => slug.toLowerCase());
  return CONNECTABLE_APPS.some((app) => app.calendar && wanted.includes(app.key));
}

/**
 * The offered apps, under the heading each belongs to.
 *
 * 🔴 NOTHING MAY VANISH BY FAILING TO MATCH A HEADING. The settings screen calls this with apps
 * that arrived over the wire from `/api/composio`, so a browser holding the page while the server
 * is redeployed can be handed a row whose `group` this build has never heard of. Anything
 * unmatched is collected under a final heading rather than filtered away: a connector that
 * silently stops being listed is this codebase's most-repeated defect wearing a new coat, and an
 * odd heading is a far cheaper bug than an app the learner can no longer disconnect.
 *
 * 🔴 AND AN EMPTY GROUP IS NOT RETURNED, so removing an app does not leave its heading behind.
 */
export function groupApps(
  apps: readonly ConnectableApp[],
): { label: string; apps: readonly ConnectableApp[] }[] {
  const out: { label: string; apps: readonly ConnectableApp[] }[] = [];
  const placed = new Set<string>();
  for (const group of APP_GROUPS) {
    const inGroup = apps.filter((app) => app.group === group.id);
    for (const app of inGroup) placed.add(app.key);
    if (inGroup.length > 0) out.push({ apps: inGroup, label: group.label });
  }
  const rest = apps.filter((app) => !placed.has(app.key));
  if (rest.length > 0) out.push({ apps: rest, label: "Other" });
  return out;
}

/**
 * The handful offered during first run, in the order they are shown.
 *
 * 🔴 NOT ALL ELEVEN, AND THE RESTRAINT IS THE FEATURE. A first-run screen listing
 * every connector is a permissions wall, and a student who is asked for eleven
 * things on day one grants none of them. Settings holds the full list and the
 * step says so.
 *
 * 🔴 EACH OF THESE FOUR ANSWERS THE WORK THE STUDENT JUST DID BY HAND. They have
 * spent the previous three steps typing course names and watching Nemesis pull
 * dates out of a syllabus. An LMS is where those assignments came from, and a
 * calendar is where the dates they just produced belong. That is why the ask
 * lands here rather than at the start: it is a sentence about their own work, not
 * a request for access. A file store is genuinely useful and is deliberately NOT
 * here, because "read my documents" has no such answer at this moment.
 */
export const ONBOARDING_SUGGESTED: readonly string[] = ["canvas", "google_classroom", "googlecalendar", "outlook"];

/** Those apps, in that order, as rows to render. Silently drops any the server
 *  did not send, so a build that offers fewer apps cannot render a blank row. */
export function suggestedForOnboarding(apps: readonly ConnectableApp[]): ConnectableApp[] {
  const found: ConnectableApp[] = [];
  for (const key of ONBOARDING_SUGGESTED) {
    const app = apps.find((one) => one.key === key);
    if (app) found.push(app);
  }
  return found;
}
