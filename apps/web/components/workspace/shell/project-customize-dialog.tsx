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
import { PROJECT_COLORS, projectTint } from "@/lib/learn/project-look";
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

// 🔴🔴 THE COLOUR IS BACK, BY THE SAME OWNER WHO REMOVED IT, AND THE NOTE HE REMOVED IT UNDER IS
// WORTH KEEPING. On 2026-09-03 he swept every accent (*"there should only be accents on the mascot
// and the send button and chat bubble color"*) and a green `#46a758` flask in his sidebar was the
// thing that prompted it. Later the same day: *"allow projects to have color too. and allow user to
// choose that color in the project settings."*
//
// Both instructions are right and they are about different objects — `lib/learn/project-look.ts`
// carries the distinction in full. The short version: the accent is the CHARACTER'S colour and
// means "act here"; a project colour is an identity the learner assigned so they can find one
// project in a list. The original complaint was fair for a further reason the second instruction
// names: the colour had been applied with no way to change or clear it. It is a setting now.
//
// 🔴 THE PALETTE IS NOT REDRAWN FROM THE OLD SEVEN. It is the six `--ui-kind-*` pairs, which were
// contrast-checked in both themes when #1097 restored them; the swatch stores its light hex and
// draws through the token. See project-look.ts for why that indirection exists.

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
      // 🔴 `color` IS WRITTEN AGAIN, AND NULL IS NOW A REAL CHOICE. While the picker was gone this
      // key was omitted entirely so that saving an instruction could not erase a colour nobody
      // could see or restore. The swatch row has a "None" option now, so null means the learner
      // asked for no colour rather than "this surface has no opinion".
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
                    <Codicon name={name} size="16px" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[length:var(--canvas-text-meta)] uppercase tracking-wide text-(--ui-text-quaternary)">
              Colour
            </p>
            {/* 🔴 "NONE" IS A SWATCH, NOT A MISSING ONE. Without it the only way back from a colour
                is to guess that some other gesture clears it — and being unable to undo the choice
                is half of why this feature was removed the first time. */}
            <div className="flex flex-wrap gap-1">
              {[null, ...PROJECT_COLORS.map((entry) => entry.hex)].map((hex) => {
                const chosen = (color ?? null) === hex;
                const entry = PROJECT_COLORS.find((option) => option.hex === hex);
                return (
                  <button
                    aria-label={entry?.name ?? "No colour"}
                    aria-pressed={chosen}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-lg border border-transparent transition-colors hover:bg-(--ui-control-hover-background)",
                      chosen && "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background)",
                    )}
                    key={hex ?? "none"}
                    onClick={() => setColor(hex)}
                    title={entry?.name ?? "No colour"}
                    type="button"
                  >
                    {/* The swatch is the project's own glyph in that colour, not an abstract dot:
                        it shows exactly what the sidebar row will look like. */}
                    <Codicon
                      className={cn(!hex && "text-(--ui-text-tertiary)")}
                      name={icon ?? "folder"}
                      size="16px"
                      style={projectTint({ color: hex })}
                    />
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
