"use client";

// Library sidebar's tree region, v1 empty-vault placeholder — shaped like the
// workspace shell's SidebarBlankState (components/workspace/shell/section-states.tsx)
// but with library-specific copy and no action button (cloud sync isn't live yet).

import { Codicon } from "@/components/desktop-ui/codicon";

export function LibraryTreeBlankState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Codicon className="text-(--ui-text-quaternary)" name="root-folder" size="1.25rem" />
        <p className="text-xs text-(--ui-text-tertiary)">Start your Library</p>
        <p className="max-w-52 text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
          Create a note and Nemesis connects it to what you already have.
        </p>
        <button className="text-xs font-medium text-primary hover:underline" onClick={onCreate} type="button">New note</button>
      </div>
    </div>
  );
}
