"use client";

// Customize a project: an icon, a colour, and standing instructions.
//
// 🔴 OWNER, 2026-08-30: *"only the projects should be allowed to have icons, chatgpt allows users
// to customise projects with special instructions and icon and color."* This is that surface, on
// the reference's model: presets, not free input. A fixed grid of glyphs and a fixed row of
// colours means every project stays legible in a 20px sidebar row, and nothing a learner picks
// can clash with the accent rule — these are muted identity tints on ONE glyph, not a second
// theme. The instructions box is the one free-text field, and what it feeds is the turn packet:
// every canvas filed in the project carries these lines into `turnRouterMessages` (see
// `loadProjectInstructions` and the PROJECT INSTRUCTIONS block in turn-router.ts).
//
// 🔴 SAVED AS A WHOLE, NULLS PUT THE DEFAULT BACK. "Default" is a real choice on both pickers so
// a learner can undo a look without knowing that null is how it is spelled.

import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { customizeFolder, type Folder } from "@/lib/learn/canvas-store";
import { cn } from "@/lib/utils";

/** The glyphs a project may wear. Codicon names; a test proves each exists in the font. */
export const PROJECT_ICONS: readonly string[] = [
  "folder",
  "book",
  "mortar-board",
  "beaker",
  "law",
  "graph",
  "globe",
  "rocket",
  "heart",
  "briefcase",
  "telescope",
  "flame",
];

// 🔴 A PROJECT'S COLOUR IS GONE, AND ITS ICON IS NOT (owner 2026-09-03: "remove any color
// accents throughout the app, there should only be accents on the mascot and the send button and
// chat bubble color"). This surface shipped 2026-08-30 with a seven-swatch palette, and a green
// `#46a758` flask in the sidebar is what prompted the instruction — it was the one saturated thing
// on screen that the character accent could not explain.
//
// 🔴 THE PICKER WENT WITH IT RATHER THAN JUST THE PAINT. Leaving the swatches while ignoring what
// they set would be a dead control, which this repo has a standing rule against; a project is
// identified by its glyph now, and the glyph choice is untouched.
//
// `folders.color` is still a column and still holds whatever anyone picked. Nothing reads it, so
// nothing shows it, and restoring the feature is a matter of putting this list back — but a
// SECOND colour system beside the character accent is exactly what the instruction removed.

export function ProjectCustomizeDialog({
  folder,
  onClose,
  onSaved,
  userId,
}: {
  /** The project being customized, or null while the dialog is closed. */
  folder: Folder | null;
  onClose: () => void;
  /** Re-read the sidebar after a save. The store also broadcasts, so this is belt for the row on screen. */
  onSaved: () => void;
  userId: string | null;
}) {
  const [icon, setIcon] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed from the folder each time the dialog opens on one.
  useEffect(() => {
    if (!folder) return;
    setIcon(folder.icon ?? null);
    setInstructions(folder.instructions ?? "");
  }, [folder]);

  const save = async () => {
    if (!folder) return;
    setSaving(true);
    const ok = await customizeFolder(userId, folder.id, {
      // 🔴 NO `color` KEY AT ALL, not `color: null`. Writing null would erase whatever a
      // project already wears every time anyone saves an instruction, which turns a
      // reversible removal into a destructive one.
      // "folder" IS the default glyph; storing it as null keeps "no choice" and "chose the
      // default" the same state, so a future default change reaches everyone who never picked.
      icon: icon === "folder" ? null : icon,
      instructions: instructions.trim() || null,
    });
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    }
  };

  return (
    <Dialog onOpenChange={(next) => (!next ? onClose() : undefined)} open={folder !== null}>
      <DialogContent className="max-w-[26rem]">
        <DialogHeader>
          <DialogTitle>Customize project</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Icon
            </p>
            <div className="grid grid-cols-6 gap-1">
              {PROJECT_ICONS.map((name) => {
                const chosen = (icon ?? "folder") === name;
                return (
                  <button
                    aria-label={name}
                    aria-pressed={chosen}
                    className={cn(
                      "grid h-9 place-items-center rounded-lg border border-transparent text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background)",
                      chosen && "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground",
                    )}
                    key={name}
                    onClick={() => setIcon(name)}
                    type="button"
                  >
                    <Codicon name={name} size="16px" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Instructions
            </p>
            <textarea
              className="h-28 w-full resize-none rounded-lg border border-(--ui-stroke-secondary) bg-transparent p-2.5 text-[length:var(--canvas-text-small)] text-foreground outline-none placeholder:text-(--ui-text-quaternary) focus:border-(--ui-stroke-primary)"
              maxLength={4000}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="How should Nemesis work in this project? These lines ride every canvas filed here."
              value={instructions}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()} type="button">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
