"use client";

// DEV-ONLY PREVIEW — the reading pane's tab strip, with enough tabs to see what it does.
//
// 🔴 IT EXISTS BECAUSE SIX TABS ARE UNREACHABLE IN EVERY OTHER HARNESS. The board's fixture opens
// one document and the chat's opens two, so the three things that only appear under pressure — the
// separators between tabs, the name fading out where it is cut, and the strip's own edge fade where
// it meets the tools — could not be seen at all. Owner, 2026-09-06: *"i need the tabs to actually
// match the image i sent you one for one"*, and a picture is how that gets checked.
//
// The row is `dock-panel.tsx`'s (CHROME.row), so what is drawn here is the real chrome.

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { DockTabs } from "@/components/workspace/learn/dock-tabs";
import type { DockItem } from "@/components/workspace/learn/document-dock";
import { CHROME } from "@/components/workspace/learn/reader-chrome";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";

const TITLES = [
  "Enola Holmes and the Case of the Missing Marquess",
  "Triple-receptor agonists in metabolic disease",
  "Sources for the retatrutide monograph",
  "Lilly Investor Day 2026",
  "FDA's warning on compounded peptides",
  "Retatrutide_Presentation.pptx",
];

const ITEMS: DockItem[] = TITLES.map((title, index) => ({ key: `t${index}`, kind: "check", title }));

export default function DockTabsPreview() {
  const [activeKey, setActiveKey] = useState("t5");
  const [closed, setClosed] = useState<readonly string[]>([]);
  const items = ITEMS.filter((item) => !closed.includes(item.key));
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      {/* 🔴 `data-workspace`, OR EVERY BUTTON IN HERE WEARS THE MARKETING FILL and every tab looks
          like the active one. `globals.css` gives `button:where(:not([data-workspace] *))` a solid
          ground; the real pane gets the attribute from its portal (dock-panel.tsx). */}
      <main className="min-h-screen bg-(--ui-bg-editor) p-10" data-workspace="">
        <div className="mx-auto flex w-[820px] flex-col overflow-hidden rounded-[24px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)">
          <div className={CHROME.row}>
            <div className="flex min-w-0 flex-1 items-center">
              <DockTabs
                activeKey={activeKey}
                badgeFor={(item) => (item.key === "t2" ? 3 : 0)}
                items={items}
                onAdd={() => undefined}
                onClose={(key) => setClosed((was) => [...was, key])}
                onSelect={setActiveKey}
              />
            </div>
            <div className="flex shrink-0 items-center">
              {["comment", "device-camera", "desktop-download", "screen-full", "close"].map((icon) => (
                <button className={CHROME.button} key={icon} type="button">
                  <Codicon name={icon} size={CHROME.icon} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid h-[280px] place-items-center text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            The document would be here.
          </div>
        </div>
      </main>
    </WorkspacePreviewProvider>
  );
}
