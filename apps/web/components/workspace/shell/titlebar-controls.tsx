"use client";

// Titlebar tool clusters — desktop app/shell/titlebar-controls.tsx, web v1:
// left cluster = sidebar toggle only; right cluster empty (student build shows
// only the preview-rail toggle there, and the rail is out of scope for v1).
// No drag regions / traffic-light insets — a browser tab has no window chrome.

import { Button } from "@/components/desktop-ui/button";
import { Tip } from "@/components/desktop-ui/tooltip";
import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";

const titlebarButtonClass = "text-muted-foreground/85 hover:bg-(--ui-control-hover-background) hover:text-foreground";

interface TitlebarControlsProps {
  onToggleSidebar: () => void;
}

export function TitlebarControls({ onToggleSidebar }: TitlebarControlsProps) {
  return (
    <div className="fixed left-(--titlebar-controls-left) top-(--titlebar-controls-top) z-70 flex translate-y-0.5 flex-row items-center gap-x-1 pointer-events-auto">
      <Tip label="Toggle sidebar">
        <Button
          aria-label="Toggle sidebar"
          className={titlebarButtonClass}
          onClick={onToggleSidebar}
          size="icon-titlebar"
          variant="ghost"
        >
          <IconLayoutSidebarLeftExpand size={14} stroke={1.7} />
        </Button>
      </Tip>
    </div>
  );
}
