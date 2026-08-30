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

/** The tints a project may wear. Hex presets, dark-and-light safe; null is the plain row colour. */
export const PROJECT_COLORS: readonly { name: string; value: string | null }[] = [
  { name: "Default", value: null },
  { name: "Red", value: "#e5484d" },
  { name: "Orange", value: "#f76b15" },
  { name: "Amber", value: "#ffb224" },
  { name: "Green", value: "#46a758" },
  { name: "Blue", value: "#0091ff" },
  { name: "Purple", value: "#8e4ec6" },
  { name: "Pink", value: "#d6409f" },
];

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
  const [color, setColor] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed from the folder each time the dialog opens on one.
  useEffect(() => {
    if (!folder) return;
    setIcon(folder.icon ?? null);
    setColor(folder.color ?? null);
    setInstructions(folder.instructions ?? "");
  }, [folder]);

  const save = async () => {
    if (!folder) return;
    setSaving(true);
    const ok = await customizeFolder(userId, folder.id, {
      color,
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
                    <Codicon name={name} size="16px" style={color ? { color } : undefined} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Color
            </p>
            <div className="flex items-center gap-1.5">
              {PROJECT_COLORS.map((preset) => {
                const chosen = color === preset.value;
                return (
                  <button
                    aria-label={preset.name}
                    aria-pressed={chosen}
                    className={cn(
                      "grid size-7 place-items-center rounded-full border border-transparent transition-colors hover:bg-(--ui-control-hover-background)",
                      chosen && "border-(--ui-stroke-primary)",
                    )}
                    key={preset.name}
                    onClick={() => setColor(preset.value)}
                    title={preset.name}
                    type="button"
                  >
                    {preset.value ? (
                      <span className="size-4 rounded-full" style={{ backgroundColor: preset.value }} />
                    ) : (
                      <span className="size-4 rounded-full border border-(--ui-stroke-primary)" />
                    )}
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
