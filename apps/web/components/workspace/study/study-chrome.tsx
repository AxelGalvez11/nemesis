"use client";

// Study page chrome — header (title/counts/Ask-the-agent/settings) + the
// Cards/Tests/Mind maps tab strip (library-study spec §3.2, verbatim).

import { IconCards, IconChecklist, IconSitemap } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/desktop-ui/button";
import { Settings } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

export type StudyTabId = "cards" | "tests" | "maps";

const TABS: { id: StudyTabId; label: string; icon: typeof IconCards; count: number }[] = [
  { id: "cards", label: "Cards", icon: IconCards, count: 0 },
  { id: "tests", label: "Tests", icon: IconChecklist, count: 0 },
  { id: "maps", label: "Mind maps", icon: IconSitemap, count: 0 },
];

interface StudyChromeProps {
  activeTab: StudyTabId;
  onTabChange: (tab: StudyTabId) => void;
}

export function StudyChrome({ activeTab, onTabChange }: StudyChromeProps) {
  const router = useRouter();

  return (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Study</h1>
          <p className="mt-0.5 text-[0.65rem] font-medium tabular-nums text-(--ui-text-tertiary)">
            0 due · 0 new · 0 cards
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button onClick={() => router.push("/sessions")} size="sm" variant="outline">
            <span className="size-1.5 rounded-full bg-(--theme-primary)" />
            Ask the agent
          </Button>
          <Button aria-label="Study settings" size="icon-xs" variant="ghost">
            <Settings />
          </Button>
        </div>
      </header>

      <nav
        aria-label="Study sections"
        className="mx-6 mb-3 flex items-center gap-1 border-b border-(--ui-stroke-tertiary)"
      >
        {TABS.map(({ id, label, icon: Icon, count }) => {
          const active = activeTab === id;

          return (
            <button
              className={cn(
                "relative -mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1 text-xs font-medium",
                active ? "border-(--theme-primary) text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              key={id}
              onClick={() => onTabChange(id)}
              type="button"
            >
              <Icon size={13} />
              {label}
              {count > 0 && <span className="tabular-nums text-(--ui-text-quaternary)">{count}</span>}
            </button>
          );
        })}
      </nav>
    </>
  );
}
