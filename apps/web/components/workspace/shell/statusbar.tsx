"use client";

// Statusbar — desktop app/shell/statusbar-controls.tsx. Student build hides
// every core item, so both groups render empty by default; the 20px band and
// its chrome stay (parity: the strip is part of the shell's silhouette).

import type * as React from "react";

export const STATUSBAR_ACTION_CLASS =
  "inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground disabled:cursor-default disabled:opacity-45";

interface StatusbarControlsProps {
  leftItems?: React.ReactNode;
  items?: React.ReactNode;
}

export function StatusbarControls({ leftItems, items }: StatusbarControlsProps) {
  return (
    <footer
      className="flex h-5 shrink-0 items-stretch justify-between gap-2 border-t border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-1 py-0 text-(--ui-text-tertiary)"
      data-slot="statusbar"
    >
      <div className="flex min-w-0 items-stretch gap-0.5 overflow-x-clip">{leftItems}</div>
      <div className="flex min-w-0 items-stretch gap-0.5 overflow-x-clip">{items}</div>
    </footer>
  );
}
