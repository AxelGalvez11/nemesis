"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { CardsTab } from "@/components/workspace/study/cards-tab";
import { GroupedStudyTab } from "@/components/workspace/study/grouped-study-tab";
import { StudyChrome, type StudyTabId } from "@/components/workspace/study/study-chrome";
import { StatsTab } from "@/components/workspace/study/stats-tab";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

export default function StudyPage() {
  const [activeTab, setActiveTab] = useState<StudyTabId>("cards");
  const searchParams = useSearchParams();
  const sourcePath = searchParams.get("source");
  const { artifacts, cards, reviews } = useCloudStudy();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudyChrome activeTab={activeTab} counts={{ cards: cards.length, tests: artifacts.filter((item) => item.kind === "test").length, maps: artifacts.filter((item) => item.kind === "mindmap").length, stats: reviews.length }} onTabChange={setActiveTab} />
      {activeTab === "cards" && <CardsTab sourcePath={sourcePath} />}
      {activeTab === "tests" && <GroupedStudyTab kind="tests" />}
      {activeTab === "maps" && <GroupedStudyTab kind="mindmaps" />}
      {activeTab === "stats" && <StatsTab reviews={reviews} />}
    </div>
  );
}
