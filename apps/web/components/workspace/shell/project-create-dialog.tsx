"use client";

// Making a project: name it, give it a glyph, and only then does it exist.
//
// 🔴🔴 THE OWNER SPOTTED THE DIFFERENCE AND HE WAS RIGHT. 2026-09-03: *"I thought after you click
// choose a project or create a new project, the pop-up was different, could you check with
// ChatGPT?"* Measured in his own browser the same day, on chatgpt.com's Work composer: pressing
// "New project" in the project menu closes the menu and opens a CENTRED MODAL — 512 x 264, radius
// 16, on a half-opacity scrim. Title "Create project" at 18px in a 52px band padded `8px 8px 8px
// 16px`; a "Project name" label at 14px; a 480 x 36 field, radius 8, hairline border, inset 36px on
// the left for an icon button and carrying a real example ("Copenhagen Trip") rather than an
// instruction; a tip strip under it; and a primary "Create project" button, disabled until the
// field has something in it.
//
// Nemesis had two doors to this and NEITHER was that:
//
//  1. `project-picker.tsx` turned the "New project" row INTO a text input inside the open menu — a
//     36px slot with no label, no explanation of what a project is, and no icon.
//  2. `sidebar-canvases.tsx` created a folder literally called "New project" and then opened an
//     inline rename on it. Press Escape and you are left with a project named "New project",
//     forever, which is a real row in a real table that nobody asked for.
//
// One dialog serves both now. The second door's defect goes with it: nothing is written until the
// button is pressed, so a cancelled creation leaves nothing behind.
//
// 🔴 THE GLYPH IS OURS, NOT AN EMOJI. The reference puts an emoji picker in that 36px inset; this
// product already decided a project is identified by a codicon (`project-customize-dialog.tsx`,
// owner 2026-08-30) and that the accent colour belongs to the character alone. Offering an emoji
// here would be a third identity system. The inset is the same, what sits in it is ours.

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { cn } from "@/lib/utils";

import { PROJECT_ICONS } from "./project-customize-dialog";

/**
 * 🔴 EXPLICIT PIXELS, NOT REM UTILITIES. `html { font-size: 112.5% }` in this app, so one rem is
 * 18px and every rem-named class renders 12.5% larger than its name. `docs/chatgpt-reference.md`
 * records four separate pages that were measured against the reference and then built in rem.
 */
const PANEL = "max-w-[512px] gap-0 p-0";

export function ProjectCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Make the project. Resolves to its id, or null when it could not be made. */
  onCreate: (name: string, icon: string | null) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // 🔴 A FRESH DIALOG EVERY TIME. Left alone, the name and glyph from a cancelled attempt are
  // sitting there the next time it opens, which reads as the app having half-made the project.
  useEffect(() => {
    if (open) return;
    setName("");
    setIcon(null);
    setPickingIcon(false);
    setBusy(false);
  }, [open]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    // "folder" IS the default glyph, and storing it as null keeps "no choice" and "chose the
    // default" the same state — the rule `project-customize-dialog.tsx` already applies on save.
    const id = await onCreate(trimmed, icon === "folder" ? null : icon);
    setBusy(false);
    if (id) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={PANEL}>
        <DialogHeader className="flex-row items-center px-[16px] py-[12px]">
          <DialogTitle className="text-[length:var(--canvas-text-lead)] font-normal">Create project</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-[12px] px-[16px]">
          <div>
            <label className="mb-[8px] block text-[length:var(--canvas-text-small)] text-(--ui-text-primary)" htmlFor="project-name">
              Project name
            </label>
            <div className="relative">
              {/* The glyph, inside the field's own left inset — the reference's 36px slot. */}
              <button
                aria-label="Choose an icon for this project"
                className="absolute left-[6px] top-[4px] grid size-[28px] place-items-center rounded-[6px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
                onClick={() => setPickingIcon((was) => !was)}
                type="button"
              >
                <Codicon name={icon ?? "folder"} size="16px" />
              </button>
              <input
                autoFocus
                // §46.3-exempt: 16px is the iOS-zoom threshold and only on small screens — below it
                // Safari zooms the whole viewport on focus. Desktop drops to the scale's small step,
                // which is the reference's measured 14. A platform threshold, not a type choice.
                className="h-[36px] w-full rounded-[8px] border border-(--ui-stroke-secondary) bg-transparent pl-[36px] pr-[12px] text-[16px] text-(--ui-text-primary) md:text-[length:var(--canvas-text-small)] outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-stroke-primary)"
                id="project-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void create();
                  }
                }}
                // 🔴 AN EXAMPLE, NOT AN INSTRUCTION. The reference's placeholder is "Copenhagen
                // Trip" — a name someone would actually type, which teaches what belongs in the box
                // far faster than the words "Project name" repeated inside it.
                // 🔴 AND IT NAMES NO FIELD. The first draft said "Pharmacology 2" and
                // `field-agnostic.test.ts` caught it, correctly: a placeholder is the one line on
                // this dialog that tells a learner what kind of thing Nemesis expects, and a
                // subject in it says the product is for that subject. "Second year" is true for a
                // law student and a mechanical engineer alike.
                placeholder="Second year"
                ref={field}
                value={name}
              />
              {pickingIcon && (
                <div className="absolute left-0 top-[42px] z-10 grid grid-cols-6 gap-[2px] rounded-[12px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-[6px] shadow-nous">
                  {PROJECT_ICONS.map((glyph) => (
                    <button
                      aria-label={glyph}
                      aria-pressed={(icon ?? "folder") === glyph}
                      className={cn(
                        "grid size-[32px] place-items-center rounded-[8px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background)",
                        (icon ?? "folder") === glyph && "bg-(--ui-control-active-background) text-foreground",
                      )}
                      key={glyph}
                      onClick={() => {
                        setIcon(glyph);
                        setPickingIcon(false);
                        field.current?.focus();
                      }}
                      type="button"
                    >
                      <Codicon name={glyph} size="16px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* What a project IS, said once, where someone deciding whether to make one will read it.
              The reference does the same and it is the half both of our old doors were missing. */}
          <div className="flex items-start gap-[10px] rounded-[10px] bg-(--ui-bg-tertiary) px-[12px] py-[10px]">
            <Codicon className="mt-[2px] shrink-0 text-(--ui-text-tertiary)" name="lightbulb" size="14px" />
            <p className="text-[length:var(--canvas-text-meta)] leading-[18px] text-(--ui-text-secondary)">
              A project keeps chats, files and standing instructions together. Anything filed here reads those
              instructions on every turn.
            </p>
          </div>
        </div>

        <DialogFooter className="px-[16px] py-[12px]">
          {/* Disabled until there is a name, which is the reference's own rule and is also the
              honest one: a project with no name is the row `sidebar-canvases.tsx` used to leave
              behind whenever someone pressed Escape. */}
          <Button disabled={busy || name.trim().length === 0} onClick={() => void create()} type="button">
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
