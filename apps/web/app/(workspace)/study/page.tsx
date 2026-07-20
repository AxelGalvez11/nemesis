"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CardsTab } from "@/components/workspace/study/cards-tab";
import { GroupedStudyTab } from "@/components/workspace/study/grouped-study-tab";
import { StudyChrome, type StudyReviewSettings, type StudyTabId } from "@/components/workspace/study/study-chrome";
import { StatsTab } from "@/components/workspace/study/stats-tab";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

export default function StudyPage() {
  const [activeTab, setActiveTab] = useState<StudyTabId>("cards");
  const [reviewSettings, setReviewSettings] = useState<StudyReviewSettings>({ flipAnimation: true, flashcardOutline: false });
  const searchParams = useSearchParams();
  const sourcePath = searchParams.get("source");
  const { artifacts, cards, reviews } = useCloudStudy();

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("nemesis.web.study-review-settings") ?? "null") as Partial<StudyReviewSettings> | null;
      if (saved) setReviewSettings({ flipAnimation: saved.flipAnimation !== false, flashcardOutline: saved.flashcardOutline === true });
    } catch {
      // Defaults remain active.
    }
  }, []);

  function updateReviewSettings(next: StudyReviewSettings) {
    setReviewSettings(next);
    try { window.localStorage.setItem("nemesis.web.study-review-settings", JSON.stringify(next)); } catch { /* best effort */ }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudyChrome activeTab={activeTab} counts={{ cards: cards.length, tests: artifacts.filter((item) => item.kind === "test").length, maps: artifacts.filter((item) => item.kind === "mindmap").length, stats: reviews.length }} onReviewSettingsChange={updateReviewSettings} onTabChange={setActiveTab} reviewSettings={reviewSettings} />
      {activeTab === "cards" && <CardsTab reviewSettings={reviewSettings} sourcePath={sourcePath} />}
      {activeTab === "tests" && <GroupedStudyTab kind="tests" />}
      {activeTab === "maps" && <GroupedStudyTab kind="mindmaps" />}
      {activeTab === "stats" && <StatsTab reviews={reviews} />}
    </div>
  );
}
