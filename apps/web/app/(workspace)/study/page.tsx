"use client";

// Study — fresh-install v1 (library-study spec §3). No decks/tests/mindmaps
// data model yet: every count is zero and Cards/Tests/Mind maps all render
// their respective empty states per the build plan's C3 scope.

import { useState } from "react";

import { AgentEmptyState } from "@/components/workspace/study/agent-empty-state";
import { CardsTab } from "@/components/workspace/study/cards-tab";
import { StudyChrome, type StudyTabId } from "@/components/workspace/study/study-chrome";

export default function StudyPage() {
  const [activeTab, setActiveTab] = useState<StudyTabId>("cards");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <StudyChrome activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "cards" && <CardsTab />}
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
    </div>
  );
}
