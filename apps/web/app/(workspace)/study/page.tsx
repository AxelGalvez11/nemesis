"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { AgentEmptyState } from "@/components/workspace/study/agent-empty-state";
import { CardsTab } from "@/components/workspace/study/cards-tab";
import { StudyChrome, type StudyTabId } from "@/components/workspace/study/study-chrome";
import { StatsTab } from "@/components/workspace/study/stats-tab";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

export default function StudyPage() {
  const [activeTab, setActiveTab] = useState<StudyTabId>("cards");
  const searchParams = useSearchParams();
  const sourcePath = searchParams.get("source");
  const { cards, reviews } = useCloudStudy();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <StudyChrome activeTab={activeTab} counts={{ cards: cards.length, tests: 0, maps: 0, stats: reviews.length }} onTabChange={setActiveTab} />
      {activeTab === "cards" && <CardsTab sourcePath={sourcePath} />}
      {activeTab === "tests" && (
        <AgentEmptyState
          description="Practice tests live here, grouped by course. The agent builds them from your lectures…"
          title="No practice tests yet"
        />
      )}
      {activeTab === "maps" && (
        <AgentEmptyState
          description="Mind maps live here, grouped by course — the big picture of each topic…"
          title="No mind maps yet"
        />
      )}
      {activeTab === "stats" && <StatsTab reviews={reviews} />}
    </div>
  );
}
