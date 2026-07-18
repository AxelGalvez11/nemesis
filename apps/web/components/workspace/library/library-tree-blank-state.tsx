"use client";

// Library sidebar's tree region, v1 empty-vault placeholder — shaped like the
// workspace shell's SidebarBlankState (components/workspace/shell/section-states.tsx)
// but with library-specific copy and no action button (cloud sync isn't live yet).

import { Codicon } from "@/components/desktop-ui/codicon";

export function LibraryTreeBlankState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Codicon className="text-(--ui-text-quaternary)" name="root-folder" size="1.25rem" />
        <p className="text-xs text-(--ui-text-tertiary)">Your notes live on your Mac for now</p>
        <p className="max-w-52 text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
          Cloud library sync is coming — until then, write and browse in the Mac app.
        </p>
      </div>
    </div>
  );
}
