"use client";

// "Choose project" — the front door's one control for filing a chat that does not exist yet.
//
// Owner 2026-08-29: *"could you allow the user to add the landing page chat into a project like in
// the ChatGPT landing page for the work mode?"* Measured on chatgpt.com the same day: a row appears
// UNDER the composer the moment there is something to send, carrying a folder glyph and the words
// "Choose project" beside Plugins and the connector icons. An empty composer has no row.
//
// 🔴🔴 THIS IS THE ONE THING ALLOWED UNDER THE COMPOSER, AND THE RULE IT LOOKS LIKE AN EXCEPTION TO
// IS STILL IN FORCE. `canvas-home.tsx` carries a standing note that NOTHING goes below the composer:
// the owner cut a whole strip from there on 2026-08-26 (*"the landing page has some previous chats
// in there, which I don't want"*). That ruling was about CONTENT — cards due, dates coming, rows for
// half-finished canvases — a second surface competing with the one question the page asks. This is
// not content. It is a control belonging to the composer, it says nothing until the learner has
// typed, and the owner asked for it in this position by name. The strip stays deleted.
//
// 🔴 IT NAMES A FOLDER, AND THE SIDEBAR CALLS FOLDERS PROJECTS. `Folder` is the data; "project" is
// the word every surface shows a learner (`sidebar-canvases.tsx`'s heading, and the reference's).
// The two are one thing with two names, and the seam is here rather than spread across the file.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";
import type { Folder } from "@/lib/learn/canvas-store";
import { beginConnect, type ConnectableApp } from "@/lib/workspace/composio-client";

/**
 * How the reference draws it, measured at 1176px on 2026-08-29.
 *
 * The bar sits flush under the composer (gap 0), inset 20px from its left edge, 728 wide inside a
 * 768 composer, 44 tall. The control itself is 143 x 36 at 4,4 within that bar, radius 12, padding
 * `6px 12px 6px 9px`, label 14/400/20.
 *
 * 🔴 EXPLICIT PIXELS, NOT REM UTILITIES. One rem is 18px in this app, so every rem-named class
 * renders 12.5% larger than its name — the trap `docs/chatgpt-reference.md` records four separate
 * pages falling into.
 */
// 🔴 THE BAR IS THE COMPOSER'S WIDTH, NOT THE PAGE'S. It lives in the centred column below the
// composer, which is far wider; left as `w-full` it started 151px LEFT of the composer's edge
// instead of 20px inside it. The reference insets the row 20px from the composer's own left edge,
// so the row has to be bounded by the same token the composer is.
const BAR = "mt-0 w-full max-w-[var(--composer-max-width)]";

/**
 * The grey tray the row sits on — the "lower thing" (owner 2026-08-30: *"still missing that
 * grayish bottom thing below the chat composer"*).
 *
 * The reference's own class list, read off the live element: `mx-5 -mt-5 pt-5 rounded-b-2xl
 * bg-black/3 dark:bg-white/8` — inset 20px each side (728 inside 768), tucked 20px UNDER the pill
 * with the same 20px of top padding pushing its content back out, bottom corners 16px.
 *
 * 🔴 THE TUCK IS NOT DECORATION. The pill's corner radius is 28; a tray that merely touched the
 * pill's bottom edge would show a sliver of page between its own square top corners and the pill's
 * curve. Twenty pixels of overlap put the seam behind the pill, where no gap can show. The pill
 * wears `relative z-[1]` (see canvas-home) so it paints over the tucked strip — the reference lets
 * its translucent grey wash the pill's bottom edge instead, which at 8% white in dark would tint
 * ours visibly.
 *
 * 🔴 CONTROLS INSET 4px, SO THEY LAND AT 24 AND 175 ABSOLUTE — the same two numbers the row had
 * when it was a transparent full-width strip with `px-[24px]`. The geometry the learner sees did
 * not move; only the surface under it appeared.
 */
const TRAY = "mx-[20px] -mt-[20px] rounded-b-[16px] bg-(--composer-tray) pt-[20px]";
const TRAY_ROW = "flex h-[44px] items-center gap-[8px] px-[4px]";

/**
 * One panel recipe for both menus, measured off the reference's own (project menu 224 wide, apps
 * menu 240, everything else shared): white/elevated, radius 20, `10px 0` padding — and its shadow
 * is EXACTLY the composer's three measured layers, so `--composer-edge` is reused rather than
 * restated. 🔴 NO `ring-1` ON TOP: the token's first layer IS the hairline, and drawing a ring
 * over it is the doubled-edge defect #872 fixed on the composer itself.
 */
// 🔴 RE-MEASURED IN THE OWNER'S OWN CHROME, 2026-08-30 EVENING ("did you even go into Chrome?").
// The reference panel: 224 wide, radius 20, `10px 0` pad, bottom sitting 12px above the chip (the
// earlier 4px was a mismeasure), rows 36px tall at 14px text with a 20px icon inset 20 and an 8px
// gap to the label — and every project row wears ITS OWN icon and colour, which is the half the
// first pass missed entirely. Ours measured 32px rows and plain folders before this.
const PANEL =
  "absolute bottom-[48px] left-0 z-50 overflow-hidden rounded-[20px] bg-(--ui-bg-elevated) py-[10px] shadow-[var(--composer-edge)]";
const PANEL_ITEM =
  "flex w-full items-center gap-[8px] rounded-[12px] py-[8px] pl-[10px] pr-[10px] text-left " +
  "text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)";
const PANEL_SEARCH =
  "mx-[6px] mb-[4px] flex h-[38px] items-center rounded-[10px] px-[10px]";
const CONTROL =
  "flex h-[36px] items-center gap-[6px] rounded-[12px] pl-[9px] pr-[12px] " +
  "text-[length:var(--canvas-text-small)] leading-[20px] transition-colors";

export interface ProjectPickerProps {
  /** Every project the learner has, in the sidebar's own order. */
  folders: readonly Folder[];
  /** The chosen one, or null for "not filed". */
  value: string | null;
  onChange: (folderId: string | null) => void;
  /** Make a new project and file into it. Resolves to its id, or null if it could not be made. */
  onCreate: (name: string) => Promise<string | null>;
  /** Every app the server offers, and which of them this learner has connected. */
  apps: readonly ConnectableApp[];
  connected: readonly string[];
  /** Where "Connect apps" goes — Settings owns connecting; this row only reports the state. */
  onOpenApps: () => void;
  /**
   * Hidden only while the composer is doing something else — flying out on a send, or replaced by
   * the recorder.
   *
   * 🔴 IT USED TO WAIT FOR TYPED TEXT, AND THAT WAS MY ERROR, NOT A CHOICE. I checked the reference
   * before its draft had loaded, concluded the row appears only once you type, and built that.
   * Re-checked 2026-08-30 with the composer genuinely empty: the row is there, with the placeholder
   * still showing. Owner the same day: *"ChatGPT has that lower thing below the composer and ours
   * doesn't"*. A control that hides until you type is a control nobody discovers.
   */
  shown: boolean;
}

/**
 * The real marks for the four apps a learner can connect.
 *
 * 🔴 THESE ARE GOOGLE'S OWN FILES, FETCHED FROM GOOGLE'S OWN CDN AND SERVED FROM OUR `public/`.
 * Owner 2026-08-30, asked whether to use the real logos or our icon set: *"Yes add them"*. The
 * previous pass drew codicons here because our connection data carries a key, a label and a
 * sentence and no artwork; the answer was to go and get the artwork, not to approximate it. See
 * `public/brand/google/PROVENANCE.md` for where each file came from and the rules that apply to it.
 *
 * 🔴🔴 DRAWN WITH `<img>`, NEVER INLINED, AND THIS IS NOT A STYLE PREFERENCE. All four SVGs define
 * internal ids and TWO OF THEM USE THE ID `a` (`<mask id="a">`, `fill="url(#a)"`). Inlined side by
 * side in one document those ids collide and the browser resolves every `url(#a)` to whichever
 * element came first — Gmail would paint itself with Drive's gradient. An `<img>` keeps each SVG
 * its own document, so the ids cannot see each other.
 *
 * 🔴 NOT HOT-LINKED. Serving them from `www.gstatic.com` would put Google on the request path for
 * every page view and break silently the day they re-cut the set.
 */
const APP_LOGO: Record<string, string> = {
  googledrive: "/brand/google/drive.svg",
  gmail: "/brand/google/gmail.svg",
  googlecalendar: "/brand/google/calendar.svg",
  googledocs: "/brand/google/docs.svg",
};

function ConnectedApps({ apps, connected, onOpen }: { apps: readonly ConnectableApp[]; connected: readonly string[]; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const on = apps.filter((a) => connected.includes(a.key));
  const off = apps.filter((a) => !connected.includes(a.key));

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  /**
   * 🔴 CONNECTING STARTS HERE, ON GOOGLE'S OWN PAGE, IN A NEW TAB. `beginConnect` returns the
   * broker's consent URL and Nemesis never sees a password — the identical flow the Settings panel
   * runs, reached from where the learner already is (owner 2026-08-30: *"clicking on the projects
   * or the plug ins doesn't really work like it does in ChatGPT"*). `noopener` because the consent
   * page must not hold a handle back into the app.
   */
  const connect = async (key: string) => {
    if (busy) return;
    setBusy(key);
    const url = await beginConnect(key);
    setBusy(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(CONTROL, "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)", open && "bg-(--ui-bg-tertiary) text-(--ui-text-primary)")}
        // 🔴 AN UNCONFIGURED SERVER SKIPS THE MENU AND GOES TO SETTINGS. `apps` is empty exactly
        // when `/api/composio` reports `configured: false`; a menu over an empty list would be a
        // panel with one row pointing at Settings, which is the long way of just going there.
        onClick={() => { if (apps.length === 0) { onOpen(); return; } setOpen((was) => !was); }}
        // The marks carry `alt=""` because this title, and the visible label, already name them; a
        // screen reader announcing "Google Drive Gmail" twice is worse than once.
        title={on.length > 0 ? `Connected: ${on.map((a) => a.label).join(", ")}` : "Connect your apps"}
        type="button"
      >
        {/* 🔴🔴 NO GLYPH, EVER — THE LOGOS ARE THE ICON (owner 2026-08-30, shown seven treatments on
            the tray and choosing A: *"do something like chatgpt where it shows a favicon slash logo
            of the actual app"*). The plug codicon this replaces was the one mark on the empty state;
            now the empty state shows the logos of what CAN be connected, and the connected state
            shows what IS. The strip is the four available apps until one is yours, then only yours —
            so the control never claims a connection that does not exist: "Connect apps" beside a
            logo reads as an offer, "Apps" beside it reads as a fact.
            🔴 THE UNCONFIGURED SERVER SHOWS THE BARE WORDS. `apps` is empty exactly then; there are
            no logos to show and inventing a glyph for that one state is how the plug got in. */}
        <span>{on.length > 0 ? "Apps" : "Connect apps"}</span>
        {(on.length > 0 ? on : apps).length > 0 && (
          // 🔴 SPACED, NOT STACKED. The reference overlaps its logos by 8px, which reads as a pile of
          // distinct brand colours; spaced at 20px each stays legible at this size.
          <span className="ml-[2px] flex shrink-0 items-center gap-[5px]">
            {(on.length > 0 ? on : apps).map((a) => APP_LOGO[a.key]).filter(Boolean).slice(0, 4).map((src) => (
              // 🔴 EXPLICIT `width`/`height` ATTRIBUTES AS WELL AS THE CLASS. Without intrinsic
              // dimensions the row reflows the instant the icons decode, which on a slow connection
              // is a visible jump in a control the learner may already be reaching for.
              /* eslint-disable-next-line @next/next/no-img-element */
              <img alt="" className="size-[20px] shrink-0" height={20} key={src} src={src} width={20} />
            ))}
          </span>
        )}
      </button>

      {open && (
        // The reference's apps menu: 240 wide, opening upward, rows of logo + name, a divider, and
        // one action at the bottom. Its search field is deliberately not copied — it filters a list
        // of dozens of connectors; ours has four fixed rows, and a filter over four rows is theater.
        <div className={cn(PANEL, "w-[240px]")} role="menu">
          {/* 🔴 A CONNECTED ROW IS STATUS, NOT A CONTROL. There is nothing per-conversation to
              toggle — a connection is account-wide — so drawing it as a button would be a control
              that does nothing, which §38 exists to ban. The check says "already yours". */}
          {on.map((a) => (
            <div className={cn(PANEL_ITEM, "mx-[6px] w-auto cursor-default hover:bg-transparent")} key={a.key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="size-[20px] shrink-0" height={20} src={APP_LOGO[a.key] ?? ""} width={20} />
              <span className="min-w-0 truncate">{a.label}</span>
              <Codicon className="ml-auto shrink-0 text-(--ui-action)" name="check" size="0.875rem" />
            </div>
          ))}
          {off.map((a) => (
            <button
              className={cn(PANEL_ITEM, "mx-[6px] w-auto disabled:opacity-60")}
              disabled={busy === a.key}
              key={a.key}
              onClick={() => void connect(a.key)}
              role="menuitem"
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="size-[20px] shrink-0" height={20} src={APP_LOGO[a.key] ?? ""} width={20} />
              <span className="min-w-0 truncate">{a.label}</span>
              <span className="ml-auto shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
                {busy === a.key ? "Opening…" : "Connect"}
              </span>
            </button>
          ))}
          <div className="mx-[10px] my-[6px] h-px bg-(--ui-stroke-tertiary)" />
          <button className={cn(PANEL_ITEM, "mx-[6px] w-auto")} onClick={() => { setOpen(false); onOpen(); }} role="menuitem" type="button">
            {/* 🔴 THE ROW SAYS WHERE IT GOES. "Manage connections" opened Settings; it opens the
                Plugins page now (owner 2026-08-30), and it is named in the destination's own word —
                the rail row this leads to is labelled Plugins. The puzzle piece is that page's mark
                (#921); a settings gear promised Settings, which is exactly the wrong turn removed.
                The plug stays retired (#915). */}
            <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="extensions" size="1rem" />
            <span>Manage plugins</span>
            <Codicon className="ml-auto shrink-0 text-(--ui-text-tertiary)" name="chevron-right" size="0.875rem" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectPicker({ folders, value, onChange, onCreate, shown, apps, connected, onOpenApps }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const chosen = folders.find((f) => f.id === value) ?? null;
  const q = search.trim().toLowerCase();
  const listed = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders;

  // 🔴 CLOSED BY A POINTER ANYWHERE ELSE, INCLUDING INSIDE THE COMPOSER. A menu that survives a
  // click into the text field is a menu covering the thing the learner just went back to.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) { setOpen(false); setNaming(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setNaming(false); }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);

  // 🔴 THE ROW IS UNMOUNTED, NOT HIDDEN, so an open menu cannot outlive the reason it appeared —
  // clearing the composer while the list is open would otherwise leave it floating over nothing.
  if (!shown) return null;

  const create = async () => {
    const name = draft.trim();
    if (!name) return;
    setNaming(false); setDraft(""); setOpen(false);
    const id = await onCreate(name);
    if (id) onChange(id);
  };

  return (
    <div className={BAR} ref={wrap}>
      <div className={TRAY}>
      <div className={TRAY_ROW}>
      <div className="relative">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            CONTROL,
            chosen
              ? "bg-(--ui-bg-tertiary) text-(--ui-text-primary)"
              : "text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)",
          )}
          onClick={() => { setOpen((was) => !was); setNaming(false); setSearch(""); }}
          type="button"
        >
          {/* The chosen project's OWN mark rides the chip, exactly as it rides its picker row. */}
          <Codicon
            className="shrink-0"
            name={chosen ? (chosen.icon ?? "folder-opened") : "folder"}
            size="1rem"
            style={chosen?.color ? { color: chosen.color } : undefined}
          />
          <span className="max-w-[220px] truncate">{chosen ? chosen.name : "Choose project"}</span>
          {chosen && (
            // 🔴 A REAL BUTTON WOULD NEST INSIDE THIS ONE, WHICH IS INVALID AND UNCLICKABLE IN
            // SAFARI. A span with a role does the same job and stays in the accessibility tree.
            <span
              aria-label="Clear project"
              className="ml-[2px] grid size-[18px] shrink-0 place-items-center rounded-full text-(--ui-text-quaternary) hover:bg-(--ui-bg-secondary) hover:text-(--ui-text-primary)"
              onClick={(event) => { event.stopPropagation(); onChange(null); }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange(null); } }}
              role="button"
              tabIndex={0}
            >
              <Codicon name="close" size="0.75rem" />
            </span>
          )}
        </button>

        {open && (
          // 🔴🔴 OPENS UPWARD — THE THIRD ANSWER, AND THIS ONE IS THE OWNER'S. First built upward on
          // a guess, moved downward on my own reasoning that an upward list covers the words being
          // filed, then the owner ruled (2026-08-30: *"clicking on the projects ... doesn't really
          // work like it does in ChatGPT. I needed to work like it does"*) and the reference was
          // re-measured to settle it: its panel opens UPWARD, bottom anchored 4px above the button,
          // left-aligned — and yes, it covers its own composer while open. A menu is modal enough
          // that nothing under it is being read; my reasoning was taste, and taste loses to the
          // measured reference the owner named twice. Panel: 224 wide, radius 20, `10px 0` pad,
          // search on top, 36px rows at 12px radius, divider, New project last.
          <div className={cn(PANEL, "w-[224px]")} role="menu">
            <div className={PANEL_SEARCH}>
              <input
                autoFocus
                // §46.3-exempt: 16px is the iOS-zoom threshold, but only on small screens now — desktop
                // drops to the small canvas step, the reference's measured 14 (owner's Chrome,
                // 2026-08-30). iOS zoom only bites where iOS is.
                className="min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) md:text-[length:var(--canvas-text-small)]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects…"
                value={search}
              />
            </div>
            {listed.length === 0 && !naming && (
              <p className="px-[16px] py-[6px] text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
                {q ? "No matches." : "No projects yet."}
              </p>
            )}
            {listed.map((folder) => (
              <button
                className={cn(PANEL_ITEM, "mx-[10px] w-auto whitespace-nowrap")}
                key={folder.id}
                onClick={() => { onChange(folder.id); setOpen(false); }}
                role="menuitem"
                type="button"
              >
                {/* 🔴 THE PROJECT'S OWN ICON AND COLOUR, the reference's defining detail here:
                    its picker paints "school" as a blue mortar-board, not a generic folder. The
                    colour tints only the glyph (an identity mark, never a second theme), and a
                    project that never chose keeps the plain folder. 20px, the reference's size —
                    "1rem" here is 18 because the root font is 18, the rem trap this file already
                    knows. */}
                <Codicon
                  className={cn("shrink-0", !folder.color && "text-(--ui-text-tertiary)")}
                  name={folder.icon ?? "folder"}
                  size="20px"
                  style={folder.color ? { color: folder.color } : undefined}
                />
                <span className="min-w-0 truncate">{folder.name}</span>
                {folder.id === value && <Codicon className="ml-auto shrink-0 text-(--ui-action)" name="check" size="0.875rem" />}
              </button>
            ))}
            <div className="mx-[10px] my-[6px] h-px bg-(--ui-stroke-tertiary)" />
            {naming ? (
              <div className="mx-[10px] flex items-center gap-2 py-[4px]">
                <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="new-folder" size="1rem" />
                <input
                  autoFocus
                  // §46.3-exempt: 16px is the iOS-zoom threshold, but only on small screens now — desktop
                // drops to the small canvas step, the reference's measured 14 (owner's Chrome,
                // 2026-08-30). iOS zoom only bites where iOS is.
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary) md:text-[length:var(--canvas-text-small)]"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); void create(); }
                    if (event.key === "Escape") { setNaming(false); setDraft(""); }
                  }}
                  placeholder="Project name"
                  value={draft}
                />
              </div>
            ) : (
              <button
                className={cn(PANEL_ITEM, "mx-[10px] w-auto whitespace-nowrap")}
                onClick={() => setNaming(true)}
                role="menuitem"
                type="button"
              >
                <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="new-folder" size="1rem" />
                <span>New project</span>
              </button>
            )}
          </div>
        )}
      </div>
      {/* 🔴 8px APART, WHICH IS THE REFERENCE'S OWN GAP. Its project control ends at 147 and its
          Plugins control starts at 155. Ours is a flex gap rather than a fixed x, because our
          project label grows with the chosen name and theirs does not. */}
      <ConnectedApps apps={apps} connected={connected} onOpen={onOpenApps} />
      </div>
      </div>
    </div>
  );
}
