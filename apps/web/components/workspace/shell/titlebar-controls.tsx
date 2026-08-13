"use client";

// Titlebar tool clusters — desktop app/shell/titlebar-controls.tsx, web v1:
// left cluster = sidebar toggle only; right cluster empty (student build shows
// only the preview-rail toggle there, and the rail is out of scope for v1).
// No drag regions / traffic-light insets — a browser tab has no window chrome.

import { PanelLeft } from "lucide-react";

import { Button } from "@/components/desktop-ui/button";
import { Tip } from "@/components/desktop-ui/tooltip";

const titlebarButtonClass = "text-muted-foreground/85 hover:bg-(--ui-control-hover-background) hover:text-foreground";

interface TitlebarControlsProps {
  onToggleSidebar: () => void;
}

export function TitlebarControls({ onToggleSidebar }: TitlebarControlsProps) {
  return (
    <div className="fixed left-(--titlebar-controls-left) top-(--titlebar-controls-top) z-70 flex translate-y-0.5 flex-row items-center gap-x-1 pointer-events-auto">
      {/* No <Tip> wrapper any more: Button gives every icon-sized button a
          tooltip from its aria-label. Wrapping here as well rendered the
          tooltip twice, stacked on top of itself. */}
      <Button
        aria-label="Toggle sidebar"
        className={titlebarButtonClass}
        onClick={onToggleSidebar}
        size="icon-titlebar"
        variant="ghost"
      >
        {/* 🔴 THE PANEL-LEFT GLYPH THE OWNER SUPPLIED (UX brief §27.1) — a rounded square with a
            filled left rail, and THE sidebar icon wherever this control appears. It replaces
            tabler's sidebar-with-an-arrow, which drew a second meaning ("expand") onto a control
            whose meaning is "the sidebar". Under §38.1 this toggle no longer appears inside a
            canvas at all; it is still the rail's icon everywhere the rail can be reached. */}
        <PanelLeft size={14} strokeWidth={1.7} />
      </Button>
    </div>
  );
}
