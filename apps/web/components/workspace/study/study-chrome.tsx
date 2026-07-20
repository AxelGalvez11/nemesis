"use client";

// Study page chrome — compact title/settings plus a centered page selector.

import { IconCards, IconChartBar, IconChecklist, IconChevronDown, IconSitemap } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { Settings } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

export type StudyTabId = "cards" | "tests" | "maps" | "stats";
export interface StudyReviewSettings {
  flipAnimation: boolean;
  flashcardOutline: boolean;
}

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
  reviewSettings: StudyReviewSettings;
  onReviewSettingsChange: (settings: StudyReviewSettings) => void;
}

export function StudyChrome({ activeTab, counts, onTabChange, reviewSettings, onReviewSettingsChange }: StudyChromeProps) {
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]!;
  const ActiveIcon = active.icon;

  return (
    <header className="workspace-page-header relative flex min-h-12 shrink-0 items-center justify-between gap-3 px-6 py-2.5 max-sm:px-4">
      <h1 className="workspace-page-title">Study</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Choose study page"
            className="absolute left-1/2 min-w-32 -translate-x-1/2 gap-2 rounded-xl bg-black/[0.055] dark:bg-white/[0.08] max-sm:relative max-sm:left-auto max-sm:translate-x-0"
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Study settings" className="size-9 rounded-xl" size="icon" variant="ghost">
            <Settings className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuCheckboxItem checked={reviewSettings.flipAnimation} onCheckedChange={(checked) => onReviewSettingsChange({ ...reviewSettings, flipAnimation: checked })}>
            Card flip animation
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={reviewSettings.flashcardOutline} onCheckedChange={(checked) => onReviewSettingsChange({ ...reviewSettings, flashcardOutline: checked })}>
            Flashcard outline
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
