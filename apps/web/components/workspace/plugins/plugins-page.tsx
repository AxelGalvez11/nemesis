"use client";

// Apps — the home of the apps a learner has connected to Nemesis.
//
// 🔴🔴 2026-09-04: THE PAGE WEARS THE SHARED FRAME (`shell/page-frame.tsx`). The owner's sequence
// that day: the shelf pages "looked too much like ChatGPT"; then, pointing at
// gemini.google.com/library, "maybe something similar to this"; then "make sure spacing is
// consistent across projects, library, and apps pages". So the title row, the column, the round
// buttons and the soft rows are the frame's, measured off Gemini and documented there.
//
// 🔴🔴 THE SECTIONS ARE THE LIST'S OWN GROUPS. Every app the route sends carries a `group`, and
// `APP_GROUPS` names them in order (Coursework, Files, Mail and dates, Notes and documents,
// Lectures). An earlier draft cut the list at its sixth entry and called the halves "Popular"
// and "Study & productivity", which put Gmail in one and Outlook in the other. A heading has to
// be true of what is under it.
//
// 🔴 THE DESCRIPTION IS THE WHOLE SENTENCE. On a 760px row it has room for two lines, so nothing
// here truncates; the route writes those sentences to be read.
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
import {
  FRAME_BUTTON_FILL,
  FRAME_ROW_GAP_PX,
  FRAME_ROW_H_PX,
  PageFrame,
  PageTitle,
  RoundButton,
  RowText,
  SOFT_ROW,
  Section,
} from "@/components/workspace/shell/page-frame";
import { forgetToolCatalogue } from "@/lib/learn/canvas-tools";
import { APP_GROUPS } from "@/lib/workspace/composio-apps";
import { cn } from "@/lib/utils";
import { PluginIcon } from "./plugin-icon";

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

export function PluginsPage({ preview, userId }: { preview?: ConnectionStatus; userId: string | null }) {
  const [status, setStatus] = useState<ConnectionStatus>(NOT_CONFIGURED);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Whether the round magnifier has opened into a field. Closes again when emptied and left. */
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Set when a provider's consent tab has been opened, cleared once this page has re-read status
  // on the learner's return. See the focus effect below.
  const awaitingReturn = useRef(false);

  const refresh = useCallback(async () => {
    if (preview) {
      setStatus(preview);
      setLoaded(true);
      return;
    }
    // 🔴 THE CANVAS'S CACHED TOOL CATALOGUE GOES WITH EVERY REFRESH, exactly as it does in the
    // Settings card this page grew out of. That cache holds what a learner can ask Nemesis to do
    // for up to two minutes; connecting Gmail here and going straight to a canvas to ask about
    // your mail would otherwise read as the connection not having worked.
    forgetToolCatalogue();
    setStatus(await connectionStatus());
    setLoaded(true);
  }, [preview]);

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
  const sections = APP_GROUPS.map((group) => ({ apps: shown.filter((app) => app.group === group.id), label: group.label })).filter(
    (section) => section.apps.length > 0,
  );

  const searchControl = searching ? (
    <label className="relative flex h-[40px] w-[240px] items-center">
      <Search aria-hidden className="pointer-events-none absolute left-[14px] text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
      <input
        aria-label="Search apps"
        autoFocus
        className={cn("h-full w-full rounded-full pr-[14px] pl-[40px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none", FRAME_BUTTON_FILL)}
        onBlur={() => { if (query === "") setSearching(false); }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search apps"
        type="text"
        value={query}
      />
    </label>
  ) : (
    <RoundButton label="Search apps" onClick={() => setSearching(true)}>
      <Search size={18} strokeWidth={1.8} />
    </RoundButton>
  );

  return (
    <PageFrame>
      <PageTitle controls={searchControl}>Apps</PageTitle>

      {notice && (
        <p
          className="mt-[16px] rounded-[12px] bg-(--ui-bg-tertiary) px-[12px] py-[10px] text-[13px] leading-[18px] text-(--ui-text-secondary)"
          role="status"
        >
          {notice}
        </p>
      )}

      {!loaded ? (
        <p className="mt-[24px] px-[20px] text-[14px] text-(--ui-text-tertiary)">Loading…</p>
      ) : (
        <>
          {!status.configured && (
            <p className="mt-[24px] px-[20px] text-[14px] leading-[20px] text-(--ui-text-secondary)">
              Connected apps are not set up on this server yet.{" "}
              {status.apps.length > 0
                ? "When they are, the apps below will be ready to connect."
                : "When they are, the apps you can connect will show up here."}{" "}
              There is nothing for you to do.
            </p>
          )}

          {/* 🔴 ONLY WHEN SOMETHING IS CONNECTED. An empty strip under a heading reading
              "Connected" is a shelf that looks broken rather than empty. And no round chevron on
              this heading: there is nothing to view all OF, and a control that goes nowhere is
              the dead control this codebase keeps rebuilding. */}
          {connected.length > 0 && (
            <Section title="Connected">
              <div className="flex flex-wrap items-center gap-[8px] px-[20px]">
                {connected.map((app) => (
                  <span key={app.key} title={app.label}>
                    <PluginIcon appKey={app.key} label={app.label} />
                  </span>
                ))}
              </div>
            </Section>
          )}

          {status.apps.length > 0 && (
            sections.length === 0 ? (
              <p className="mt-[24px] px-[20px] text-[14px] text-(--ui-text-tertiary)">No app matches that.</p>
            ) : (
              sections.map((section) => (
            <Section key={section.label} title={section.label}>
              <div className="flex flex-col" style={{ gap: FRAME_ROW_GAP_PX }}>
                {section.apps.map((app) => (
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
            </Section>
              ))
            )
          )}

          {/* The safety line the owner set when this feature was built: reading is free, writing
              asks first. It was in the Settings card, and it has to survive the move, because a
              permissions surface that does not say what it permits is a consent screen in name. */}
          <p className="mt-[32px] max-w-[560px] px-[20px] text-[13px] leading-[18px] text-(--ui-text-tertiary)">
            Once an app is connected, Nemesis can read from it. Before it sends, posts or deletes
            anything, it shows you what it is about to do and waits for you to say yes.
          </p>
        </>
      )}
    </PageFrame>
  );
}

/**
 * One app: a soft row with its own tile on the left and its one control on the right.
 *
 * 🔴 THE ROW ITSELF IS NOT A BUTTON, AND SO IT DOES NOT LIGHT UP ON HOVER. The reference's rows
 * open an app detail page; we have no such page, and a row that fills on hover while doing
 * nothing on press is a promise the page cannot keep. The control on the right is the row's
 * whole verb, so unlike the Library's ⋯ it is printed at rest.
 *
 * 🔴 THE TILE IS 40px, NOT THE FRAME'S 24px GLYPH. A vendor mark at 24px is a smudge; the
 * Connected strip above draws the same 40px tile, so the two agree with each other.
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
    <div className={cn(SOFT_ROW, "items-center hover:bg-black/[0.03] dark:hover:bg-white/[0.06]")} style={{ minHeight: FRAME_ROW_H_PX }}>
      <PluginIcon appKey={app.key} label={app.label} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--canvas-text-body)] leading-[24px] font-normal text-(--ui-text-primary)">{app.label}</span>
        <span className="mt-[4px] line-clamp-2 text-[length:var(--canvas-text-small)] leading-[18px] text-(--ui-text-secondary)">{app.detail}</span>
      </span>
      {/* 🔴 NO CONTROL AT ALL UNTIL THE SERVER IS CONFIGURED. See the header: a `+` that cannot
          connect anything is the dead control this codebase keeps rebuilding. */}
      {configured && (
        <span className="shrink-0">
          {busy ? (
            <span aria-label="Working" className="flex size-[40px] items-center justify-center text-(--ui-text-tertiary)" role="status">
              <Loader2 className="animate-spin" size={18} />
            </span>
          ) : connected ? (
            <DropdownMenu>
              {/* 🔴 ONE ITEM IN THIS MENU, AND IT IS THE ONLY ONE THAT EXISTS. The reference's
                  `…` opens a menu of app settings we do not have. Padding it out with greyed
                  rows would be four dead controls where there was none. */}
              <DropdownMenuTrigger
                aria-label={`Options for ${app.label}`}
                className={cn("flex size-[40px] items-center justify-center rounded-full text-(--ui-text-primary) transition-colors", FRAME_BUTTON_FILL)}
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
            <RoundButton label={`Connect ${app.label}`} onClick={onConnect}>
              <Plus size={20} strokeWidth={1.8} />
            </RoundButton>
          )}
        </span>
      )}
    </div>
  );
}
