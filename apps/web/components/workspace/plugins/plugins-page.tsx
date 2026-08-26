"use client";

// Plugins — the home of the apps a learner has connected to Nemesis.
//
// The Composio door has existed since workstream E (`/api/composio`), but its only surface was a
// small bordered list buried in Settings: no icons, settings type scale, four rows of text. This
// promotes it to a real destination, drawn to the measured reference (see the reference notes
// quoted beside each number below).
//
// 🔴 THE APP LIST IS THE SERVER'S, NEVER A SECOND COPY. `/api/composio` owns which apps may be
// connected and the one-line description of each. A copy here would be a list that looks right on
// the day it is written and quietly disagrees the day the owner adds a fifth app: the page would
// offer something the route refuses, or hide something it allows. So this file knows no app names
// at all, only how to draw whatever comes back.
//
// 🔴 "NOT SET UP YET" IS A STATE, NOT AN ERROR. Without a server key the route answers HTTP 200
// with `{apps, configured: false}` — the list, and a flag saying nothing can be connected yet. So
// the page still draws the four rows (a learner can see what is coming) and simply gives them no
// connect button, because a `+` that cannot connect anything is the dead control this codebase
// keeps rebuilding. One plain sentence carries the rest.
//
// 🔴 NO SKILLS TAB. The reference pairs Plugins with a Skills toggle. We have no skills, and a
// segmented control whose second half is empty is worse than no control: it advertises a room
// that does not exist.
//
// 🔴 EVERY SIZE IS WRITTEN IN PX, ON PURPOSE. `html { font-size: 112.5% }` in this app, so Tailwind's
// own rem-based scale paints 1.125x what its name says: `text-sm` is 15.75px, `gap-2` is 9px. A
// page whose whole job is matching measured numbers cannot be written in a unit that silently
// multiplies them.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Plus, Search } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import {
  beginConnect,
  connectionStatus,
  disconnect,
  NOT_CONFIGURED,
  type ConnectableApp,
  type ConnectionStatus,
} from "@/lib/workspace/composio-client";
import { forgetToolCatalogue } from "@/lib/learn/canvas-tools";
import { PluginIcon } from "./plugin-icon";

/**
 * The 4px inset that puts a non-grid block on the 768px reading column.
 *
 * The content box is 776px because that is what the reference's grid measures; everything that is
 * not the grid sits 4px inside it, which is the 768px column §2 measures. A row inside a 384px
 * grid cell carries the same 4px itself, so an app's icon lines up with the "Plugins" title above
 * it rather than sitting four pixels to its left.
 */
const ALIGNED = "px-[4px]";

/**
 * Does this app match what the learner typed?
 *
 * 🔴 THE DESCRIPTION IS SEARCHED, NOT JUST THE NAME. Somebody looking for their timetable types
 * "deadline", not "Google Calendar" — and the route's own one-liner for Calendar is the sentence
 * that contains the word. Matching names alone would make the box look broken for exactly the
 * learner who did not already know which app they wanted.
 */
function matches(app: ConnectableApp, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${app.label} ${app.detail}`.toLowerCase().includes(needle);
}

export function PluginsPage({ userId }: { userId: string | null }) {
  const [status, setStatus] = useState<ConnectionStatus>(NOT_CONFIGURED);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Set when a provider's consent tab has been opened, cleared once this page has re-read status
  // on the learner's return. See the focus effect below.
  const awaitingReturn = useRef(false);

  const refresh = useCallback(async () => {
    // 🔴 THE CANVAS'S CACHED TOOL CATALOGUE GOES WITH EVERY REFRESH, exactly as it does in the
    // Settings card this page grew out of. That cache holds what a learner can ask Nemesis to do
    // for up to two minutes; connecting Gmail here and going straight to a canvas to ask about
    // your mail would otherwise read as the connection not having worked.
    forgetToolCatalogue();
    setStatus(await connectionStatus());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    // `userId` is a dependency because signing into a different account must re-ask: connected
    // accounts are per learner, and the previous learner's answer is on screen until this re-runs.
  }, [refresh, userId]);

  // 🔴 COMING BACK FROM THE CONSENT TAB IS WHAT REFRESHES THIS PAGE, so nothing has to tell the
  // learner to reload their browser. The OAuth round trip finishes in a tab we do not own and
  // sends no message back; the one signal we do get is this window regaining focus. Guarded by
  // `awaitingReturn` so ordinary tab switching does not re-ask on every focus.
  useEffect(() => {
    const onFocus = () => {
      if (!awaitingReturn.current) return;
      awaitingReturn.current = false;
      setNotice(null);
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const connect = useCallback(async (app: string) => {
    setBusy(app);
    setNotice(null);
    const url = await beginConnect(app);
    setBusy(null);
    if (!url) {
      setNotice("Could not start that connection. Try again in a moment.");
      return;
    }
    awaitingReturn.current = true;
    // 🔴 `noopener` — the provider's page must not get a handle on this one. And a NEW TAB rather
    // than this one: sending a learner away from a half-typed canvas to authorise Drive, then
    // dropping them back at the front door, loses their work.
    window.open(url, "_blank", "noopener,noreferrer");
    setNotice("Finish signing in on the tab that just opened. This page updates when you come back.");
  }, []);

  const remove = useCallback(
    async (app: string) => {
      setBusy(app);
      const ok = await disconnect(app);
      setBusy(null);
      setNotice(ok ? null : "Could not disconnect that app. Try again in a moment.");
      void refresh();
    },
    [refresh],
  );

  const connected = status.apps.filter((app) => status.connected.includes(app.key));
  const shown = status.apps.filter((app) => matches(app, query));

  return (
    // The shell hands every surface a box with `overflow-hidden`, so a page owns its own scroll.
    <div className="scrollbar-dt h-full overflow-y-auto">
      <div className="px-[24px] py-[40px]">
        {/* 🔴 THE CONTENT BOX IS 776px AND THE READING COLUMN INSIDE IT IS 768px, WHICH IS THE
            REFERENCE'S OWN ARITHMETIC RATHER THAN A ROUNDING SLIP. Reference §2 measures the
            content column at 768px on all three pages; §4 measures the app grid at "2 columns of
            384px, row-gap 16px, column-gap 8px (776px overall)". 776 is 8px WIDER than 768, so the
            grid deliberately sits 4px proud of the reading column on each side, and each row's own
            4px of padding brings its icon back into line with the title above it. Every block that
            is not the grid therefore carries `ALIGNED` below.

            🔴 THE FIRST DRAFT PUT `max-w-[768px] px-[24px]` ON ONE ELEMENT AND MEASURED 356px
            COLUMNS. The page padding came out of the same box, so 768 minus 48 left 720 for a grid
            that then shrank two 384px tracks to fit. The padding lives on a wrapper now, and the
            tracks measure 384. This is exactly the failure a page of measured numbers invites:
            nothing errored, nothing looked obviously wrong, and every number was off by 28px. */}
        <main className="mx-auto w-full max-w-[776px]">
          <header className={ALIGNED}>
            <div className="flex items-start justify-between gap-[16px]">
              <div className="min-w-0">
                {/* Reference §4: "Plugins" at 28px / weight 500 / line-height 34px. */}
                <h1 className="text-[28px] leading-[34px] font-medium text-(--ui-text-primary)">Plugins</h1>
                {/* Reference §4: subtitle 16px / weight 400 / secondary text.

                    🔴 ONE LINE, AND IT WAS TWO. The title block shares its row with a 240px search
                    pill, so this sentence has about 510px to live in; the first draft ran to 74
                    characters and wrapped, which pushed the strip below it out of the reference's
                    rhythm. What it used to also say (that Nemesis reads from a connected app) is
                    said properly at the foot of the page, where the rest of the promise is. */}
                <p className="mt-[6px] text-[16px] leading-[22px] font-normal text-(--ui-text-secondary)">
                  Work with Nemesis in the apps you already use.
                </p>
              </div>
              {/* Reference §2: a 36px rounded-full search input, right-aligned on the title row,
                  240px wide, 14px text, with a leading magnifier.

                  🔴 IT FILTERS, IT DOES NOT SEARCH ANYWHERE. Four apps is a short list today, and a
                  box that only reorders four rows would be decoration. It earns its place two ways:
                  it reads the descriptions as well as the names (see `matches`), and the list it
                  filters is the server's, which the owner grows without touching this file. */}
              <label className="flex h-[36px] w-[240px] shrink-0 items-center gap-[8px] rounded-full bg-(--ui-bg-tertiary) px-[12px] ring-1 ring-(--ui-stroke-tertiary) ring-inset focus-within:ring-(--ui-stroke-secondary)">
                <Search className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                <input
                  aria-label="Search apps"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search apps"
                  type="search"
                  value={query}
                />
              </label>
            </div>

            {notice && (
              <p
                className="mt-[16px] rounded-[12px] bg-(--ui-bg-tertiary) px-[12px] py-[10px] text-[13px] leading-[18px] text-(--ui-text-secondary)"
                role="status"
              >
                {notice}
              </p>
            )}
          </header>

          {!loaded ? (
            <p className={`${ALIGNED} mt-[32px] text-[14px] text-(--ui-text-tertiary)`}>Loading…</p>
          ) : (
            <>
              {!status.configured && (
                <p className={`${ALIGNED} mt-[32px] text-[14px] leading-[20px] text-(--ui-text-secondary)`}>
                  Connected apps are not set up on this server yet.{" "}
                  {status.apps.length > 0
                    ? "When they are, the apps below will be ready to connect."
                    : "When they are, the apps you can connect will show up here."}{" "}
                  There is nothing for you to do.
                </p>
              )}

              {/* Reference §4: an "Installed" strip of ~40px rounded app icons above the grid.
                  🔴 ONLY WHEN SOMETHING IS CONNECTED. An empty strip under a heading reading
                  "Connected" is a shelf that looks broken rather than empty. */}
              {connected.length > 0 && (
                <section className={`${ALIGNED} mt-[32px]`}>
                  <h2 className="text-[14px] font-medium text-(--ui-text-primary)">Connected</h2>
                  <div className="mt-[12px] flex flex-wrap items-center gap-[8px]">
                    {connected.map((app) => (
                      <span key={app.key} title={app.label}>
                        <PluginIcon appKey={app.key} label={app.label} />
                        <span className="sr-only">{app.label}</span>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {status.apps.length > 0 && (
                <section className="mt-[32px]">
                  {/* Reference §4: section headers at 14px / weight 500 / primary text. The
                      reference splits its grid into "Featured" and "Productivity"; four apps do not
                      make two categories, and inventing them would be a taxonomy with nothing in it. */}
                  <h2 className={`${ALIGNED} text-[14px] font-medium text-(--ui-text-primary)`}>All apps</h2>

                  {shown.length === 0 ? (
                    <p className={`${ALIGNED} mt-[12px] text-[14px] text-(--ui-text-tertiary)`}>No app matches that.</p>
                  ) : (
                    // Reference §4: 2 columns of 384px, row-gap 16px, column-gap 8px, so the grid
                    // measures 776px overall and sits 4px proud of the 768px column on each side.
                    // One column below `lg`, because two 384px tracks plus a 237px sidebar do not fit a
                    // narrower viewport, and a page that scrolls sideways is worse than one that stacks.
                    // `minmax(0,384px)` rather than a fixed 384 so the tracks give way instead of
                    // overflowing on the widths in between.
                    <div className="mt-[12px] grid w-full grid-cols-1 gap-x-[8px] gap-y-[16px] lg:grid-cols-[repeat(2,minmax(0,384px))]">
                      {shown.map((app) => (
                        <PluginRow
                          app={app}
                          busy={busy === app.key}
                          configured={status.configured}
                          connected={status.connected.includes(app.key)}
                          key={app.key}
                          onConnect={() => void connect(app.key)}
                          onDisconnect={() => void remove(app.key)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* The safety line the owner set when this feature was built: reading is free, writing
                  asks first. It was in the Settings card, and it has to survive the move, because a
                  permissions surface that does not say what it permits is a consent screen in name. */}
              <p className={`${ALIGNED} mt-[32px] max-w-[560px] text-[13px] leading-[18px] text-(--ui-text-tertiary)`}>
                Once an app is connected, Nemesis can read from it. Before it sends, posts or deletes
                anything, it shows you what it is about to do and waits for you to say yes.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * One app in the grid.
 *
 * Reference §4: the row is about 76px tall, with a 40x40 icon, a 14px/400 title, a one-line
 * 13px/400 description in tertiary text, and a trailing control on the right.
 *
 * 🔴 THE ROW ITSELF IS NOT A BUTTON, AND SO IT DOES NOT LIGHT UP ON HOVER. The reference's rows
 * open an app detail page; we have no such page, and a row that fills on hover while doing nothing
 * when pressed is a promise the surface cannot keep. The trailing control is the only thing here
 * that does anything, and it is the only thing that reacts.
 */
function PluginRow({
  app,
  busy,
  configured,
  connected,
  onConnect,
  onDisconnect,
}: {
  app: ConnectableApp;
  busy: boolean;
  configured: boolean;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex h-[76px] items-center gap-[12px] rounded-[12px] px-[4px]">
      <PluginIcon appKey={app.key} label={app.label} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] leading-[20px] font-normal text-(--ui-text-primary)">{app.label}</p>
        {/* One line, truncated, exactly as measured. The route writes these sentences. */}
        {/* 🔴 `title` BECAUSE THIS LINE TRUNCATES BY DESIGN. A 384px cell leaves the description
            about 292px, and the route's sentences are longer than that, so the reference's
            one-truncated-line rule genuinely cuts them. Hovering gives the rest back rather than
            leaving the learner with half a sentence and no way to read it. */}
        <p
          className="mt-[2px] truncate text-[13px] leading-[18px] font-normal text-(--ui-text-tertiary)"
          title={app.detail}
        >
          {app.detail}
        </p>
      </div>
      {/* 🔴 NO CONTROL AT ALL UNTIL THE SERVER IS CONFIGURED. See the header: a `+` that cannot
          connect anything is the dead control this codebase keeps rebuilding. */}
      {configured && (
        <div className="shrink-0">
          {busy ? (
            <span
              aria-label="Working"
              className="flex h-[32px] w-[32px] items-center justify-center text-(--ui-text-tertiary)"
              role="status"
            >
              <Loader2 className="animate-spin" size={16} />
            </span>
          ) : connected ? (
            <DropdownMenu>
              {/* 🔴 ONE ITEM IN THIS MENU, AND IT IS THE ONLY ONE THAT EXISTS. The reference's
                  `…` opens a menu of app settings we do not have. Padding it out with greyed
                  rows would be four dead controls where there was none. */}
              <DropdownMenuTrigger
                aria-label={`Options for ${app.label}`}
                className="flex h-[32px] w-[32px] items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
              >
                <MoreHorizontal size={18} strokeWidth={1.8} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onDisconnect} variant="destructive">
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              aria-label={`Connect ${app.label}`}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-full text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
              onClick={onConnect}
              type="button"
            >
              <Plus size={18} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
