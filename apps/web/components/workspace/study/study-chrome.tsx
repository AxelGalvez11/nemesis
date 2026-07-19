"use client";

// Study page chrome — compact title/settings plus a centered page selector.

import { IconCards, IconChartBar, IconChecklist, IconChevronDown, IconSitemap } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { useSettingsModal } from "@/components/workspace/shell/settings-modal";
import { Settings } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

export type StudyTabId = "cards" | "tests" | "maps" | "stats";

const TABS: { id: StudyTabId; label: string; icon: typeof IconCards }[] = [
  { id: "cards", label: "Cards", icon: IconCards },
  { id: "tests", label: "Tests", icon: IconChecklist },
  { id: "maps", label: "Mindmaps", icon: IconSitemap },
  { id: "stats", label: "Stats", icon: IconChartBar },
];

interface StudyChromeProps {
  activeTab: StudyTabId;
  counts: Record<StudyTabId, number>;
  onTabChange: (tab: StudyTabId) => void;
}

export function StudyChrome({ activeTab, counts, onTabChange }: StudyChromeProps) {
  const { openSettings } = useSettingsModal();
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]!;
  const ActiveIcon = active.icon;

  return (
    <header className="relative flex min-h-12 shrink-0 items-center justify-between gap-3 px-6 py-2.5">
      <h1 className="text-lg font-semibold tracking-tight">Study</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Choose study page"
            className="absolute left-1/2 min-w-32 -translate-x-1/2 gap-2 rounded-xl bg-black/[0.055] dark:bg-white/[0.08]"
            size="sm"
            variant="secondary"
          >
            <ActiveIcon size={14} />
            {active.label}
            <IconChevronDown className="ml-1 text-(--ui-text-tertiary)" size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-44">
          {TABS.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem
              className={cn(activeTab === id && "bg-black/[0.055] dark:bg-white/[0.08]")}
              key={id}
              onSelect={() => onTabChange(id)}
            >
              <Icon size={14} />
              <span>{label}</span>
              {counts[id] > 0 && <span className="ml-auto tabular-nums text-(--ui-text-quaternary)">{counts[id]}</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button aria-label="Study settings" onClick={openSettings} size="icon-xs" variant="ghost">
        <Settings />
      </Button>
    </header>
  );
}
