"use client";

// Naming a new Library folder, in the shape the reference uses.
//
// 🔴🔴 THE OWNER MADE THE BAR EXPLICIT. 2026-09-03: *"for the library in the folder button, I need
// you to actually compare that to ChatGPT. Because ChatGPT is the baseline… Making a new folder in
// the library should work exactly like it does in ChatGPT."*
//
// Measured the same day, signed in, at a 1470px viewport — chatgpt.com/library, the "New ⌄" menu,
// "Folder":
//
//   dialog   448 x 190, radius 16, padding 12 top / 16 sides / 16 bottom, no close ✕
//   title    "New folder", 18px on a 28px line
//   label    "Folder name", 14px on a 20px line, 16px under the title
//   field    416 x 38, FULLY ROUNDED, 16px side padding, 14px text, autofocused, NO placeholder,
//            8px under the label
//   footer   16px under the field — Cancel (71 x 36, hairline border) then Create (70 x 36, solid,
//            DISABLED until the field has something in it), 12px apart, right-aligned
//
// 12 + 28 + 16 + 20 + 8 + 38 + 16 + 36 + 16 = 190. The height is the parts, so getting a gap wrong
// shows up as the wrong total rather than as something only a screenshot could catch.
//
// 🔴 WHAT THIS REPLACES WAS A ROW, NOT A DIALOG. The Library named a folder INLINE, in the table
// where the folder was about to appear: an input that committed on Enter AND on blur, cancelled on
// Escape, and — because a naming row only exists in the list — silently flipped the page out of
// grid view for as long as it was open. Three ways to leave the same gesture, one of them (clicking
// anywhere else) committing something the learner may not have meant to make.
//
// 🔴 NO PLACEHOLDER, DELIBERATELY. The reference leaves the box empty, and here that is the right
// call rather than a copied one: `project-create-dialog.tsx` carries an EXAMPLE ("Second year")
// because a project is an unfamiliar object that needs teaching. Everybody already knows what a
// folder is, and `field-agnostic.test.ts` exists precisely because example text is where a subject
// sneaks into a field-agnostic product.
//
// 🔴 `--ui-action` FOR THE PRIMARY, NOT THE REFERENCE'S NEAR-WHITE. Same rule the Library's own
// "New folder" button already follows: the accent is the product's, set by the learner in Settings,
// and one literal here would be the single control in the app that ignores it.

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";

/** 448 wide, and the insets the reference measures. Explicit pixels because `html { font-size:
 *  112.5% }` makes every rem-named utility render 12.5% larger than its name. */
const PANEL = "max-w-[448px] rounded-[16px]";
// 🔴 15/11/15, NOT 16/12/16, AND THE ODD NUMBER IS THE POINT. Every dialog in this app carries a
// 1px `--stroke-nous` border that the reference's does not, and the box is border-box — so padding
// of 16 puts the content 17px from the visible edge and makes the panel 192 tall against a measured
// 190. Taking the border out of each inset lands the title, the label, the 416px field and the
// footer exactly where they sit on chatgpt.com, and keeps the house edge.
const BODY = "gap-[16px] px-[15px] pb-[15px] pt-[11px]";
const PILL = "h-[36px] rounded-full px-[12px] text-[length:var(--canvas-text-small)] font-medium transition-colors";

export function FolderCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Make the folder. Resolves true when it exists, false when the database refused. */
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // 🔴 A FRESH DIALOG EVERY TIME — a cancelled attempt's name sitting in the box on the next open
  // reads as the app having half-made the folder. Same rule as `project-create-dialog.tsx`.
  useEffect(() => {
    if (open) return;
    setName("");
    setBusy(false);
  }, [open]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const made = await onCreate(trimmed);
    setBusy(false);
    // 🔴 A REFUSAL KEEPS THE DIALOG OPEN. `createFolder` returns null when the two-level depth
    // trigger raises; closing anyway would report a folder that is not there.
    if (made) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* No ✕ — the reference has none here, and Cancel is already the way out. */}
      <DialogContent bodyClassName={BODY} className={PANEL} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-[length:var(--canvas-text-lead)] font-normal leading-[28px]">
            New folder
          </DialogTitle>
        </DialogHeader>

        <div>
          <label
            className="mb-[8px] block text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary)"
            htmlFor="library-folder-name"
          >
            Folder name
          </label>
          <input
            autoFocus
            // §46.3-exempt: 16px is the iOS-zoom threshold on small screens — under it Safari zooms
            // the whole viewport on focus. Desktop drops to the reference's measured 14.
            className="h-[38px] w-full rounded-full border border-(--ui-stroke-secondary) bg-transparent px-[16px] text-[16px] text-(--ui-text-primary) outline-none focus:border-(--ui-stroke-primary) md:text-[length:var(--canvas-text-small)]"
            id="library-folder-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void create();
            }}
            value={name}
          />
        </div>

        <div className="flex justify-end gap-[12px]">
          <button
            className={`${PILL} border border-(--ui-stroke-secondary) text-(--ui-text-primary) hover:bg-(--ui-control-hover-background)`}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancel
          </button>
          {/* Disabled until there is a name — the reference's rule, and the one that stops an
              unnamed row from ever reaching the table. */}
          <button
            className={`${PILL} bg-(--ui-action) text-(--ui-action-glyph) hover:opacity-80 disabled:opacity-50`}
            disabled={busy || name.trim().length === 0}
            onClick={() => void create()}
            type="button"
          >
            Create
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
