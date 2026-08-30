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

import { ADD_MENU } from "./add-menu-row";

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
const BAR = "mt-0 flex h-[44px] w-full max-w-[var(--composer-max-width)] items-center gap-[12px] px-[20px]";
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
  /** Hidden until the learner has something to send — the reference does the same. */
  shown: boolean;
}

export function ProjectPicker({ folders, value, onChange, onCreate, shown }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const chosen = folders.find((f) => f.id === value) ?? null;

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
          onClick={() => { setOpen((was) => !was); setNaming(false); }}
          type="button"
        >
          <Codicon className="shrink-0" name={chosen ? "folder-opened" : "folder"} size="1rem" />
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
          // Opens UPWARD: the row is already near the bottom of the block, and a list dropping
          // below it would run off a short viewport with no room to flip.
          <div className={cn("absolute bottom-[44px] left-0", ADD_MENU)} role="menu">
            {folders.length === 0 && !naming && (
              <p className="px-3 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
                No projects yet.
              </p>
            )}
            {folders.map((folder) => (
              <button
                className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)"
                key={folder.id}
                onClick={() => { onChange(folder.id); setOpen(false); }}
                role="menuitem"
                type="button"
              >
                <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="1rem" />
                <span className="min-w-0 truncate">{folder.name}</span>
                {folder.id === value && <Codicon className="ml-auto shrink-0 text-(--ui-action)" name="check" size="0.875rem" />}
              </button>
            ))}
            <div className="my-1 h-px bg-(--ui-stroke-tertiary)" />
            {naming ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="new-folder" size="1rem" />
                <input
                  autoFocus
                  // §46.3-exempt: 16px is the iOS-zoom threshold every composer input carries.
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
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
                className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)"
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
    </div>
  );
}
