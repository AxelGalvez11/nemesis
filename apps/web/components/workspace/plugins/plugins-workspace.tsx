"use client";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";

const PLUGINS = [
  { id: "web", name: "Web research", description: "Ground chats with Linkup, Tavily, and Firecrawl search.", icon: "globe", status: "Connected" },
  { id: "files", name: "Files and images", description: "Attach study material directly to a chat, from your files or your Library.", icon: "files", status: "Connected" },
  { id: "calendar", name: "Calendar", description: "Turn study plans into scheduled review blocks and reminders.", icon: "calendar", status: "Built in" },
  { id: "lms", name: "Learning management system", description: "Import courses, assignments, and due dates from your school.", icon: "organization", status: "Coming soon" },
] as const;

export function PluginsWorkspace() {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-(--ui-chat-surface-background)">
      <div className="workspace-page-header mx-auto w-full max-w-4xl px-6 pb-10 pt-5 max-sm:px-4">
        <header className="mb-6">
          <h1 className="workspace-page-title">Plugins</h1>
          <p className="mt-1 text-xs text-(--ui-text-tertiary)">Connect the tools Nemesis can use while you study and research.</p>
        </header>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {PLUGINS.map((plugin) => (
            <article className="flex min-h-36 flex-col rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm" key={plugin.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-(--ui-bg-secondary) text-(--ui-text-secondary)"><Codicon name={plugin.icon} size="1rem" /></span>
                <span className="rounded-full bg-(--ui-bg-quaternary) px-2 py-1 text-[0.65rem] font-medium text-(--ui-text-tertiary)">{plugin.status}</span>
              </div>
              <h2 className="text-sm font-semibold text-foreground">{plugin.name}</h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-(--ui-text-tertiary)">{plugin.description}</p>
              {plugin.status === "Coming soon" && <Button className="mt-3 self-start" disabled size="xs" variant="secondary">Unavailable</Button>}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
