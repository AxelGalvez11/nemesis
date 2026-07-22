"use client";

// The notebook home (Claude's project landing): a breadcrumb back to the list, the editable title, a
// central composer that starts a new chat, the Recents list of this notebook's chats, and the right
// rail — rounded Instructions + Sources cards (each opens a centered zoom-in dialog) plus Memory /
// Scheduled placeholders. Typing a prompt creates a chat and hands off to the full chat view.

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { notebookChatStore, sendNotebookTurn, type NotebookWireSource } from "@/lib/notebooks/chat";
import { DELIVERABLE_META, generateNotebookDeliverable } from "@/lib/notebooks/deliverables";
import { listNotebookOutputs, listNotebookRecordings, type NotebookOutput, type NotebookOutputKind } from "@/lib/notebooks/outputs-api";
import { requestNotebookRecording } from "@/lib/notebooks/record-intent";
import { prepareChatAttachments } from "@/lib/workspace/chat-attachments";
import type { SessionOutput } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

import { OutputCard } from "../sessions/output-card";
import { NotebookComposer } from "./notebook-composer";
import { NotebookInstructionsDialog } from "./notebook-instructions-dialog";
import { NotebookProjectMenu } from "./notebook-project-menu";
import { NotebookSourcesCard } from "./notebook-sources-card";
import { useNotebooks } from "./notebooks-store";

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat about this notebook.";

function titleFromPrompt(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 48 ? t : `${t.slice(0, 48).trimEnd()}…`;
}

function formatModified(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotebookHome() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const notebooks = useNotebooks();
  const { selected, sources, sourcesStatus, chats, chatsStatus } = notebooks;

  const [instrOpen, setInstrOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startingRecording, setStartingRecording] = useState(false);
  const [homeTab, setHomeTab] = useState<"chats" | "outputs">("chats");
  const [deliverables, setDeliverables] = useState<NotebookOutput[]>([]);
  const [recordings, setRecordings] = useState<SessionOutput[]>([]);
  const [outputsStatus, setOutputsStatus] = useState<"idle" | "loading" | "loaded">("idle");
  const [generating, setGenerating] = useState<Partial<Record<NotebookOutputKind, boolean>>>({});
  const [previewOutputs, setPreviewOutputs] = useState<SessionOutput[]>([]);
  const chatIds = useMemo(() => chats.map((c) => c.id), [chats]);
  const selectedNotebookId = selected?.id ?? null;
  const wireSources: NotebookWireSource[] = useMemo(
    () => sources.map((s) => ({ content: s.content, name: s.name })),
    [sources],
  );

  const loadOutputs = useCallback(async () => {
    if (!selectedNotebookId) return;
    setOutputsStatus("loading");
    try {
      const [rows, recs] = await Promise.all([listNotebookOutputs(selectedNotebookId), listNotebookRecordings(chatIds)]);
      setDeliverables(rows);
      setRecordings(recs.map((rec) => ({ createdAt: rec.createdAt, durationSeconds: rec.durationSeconds, id: rec.id, kind: "recording" as const, notes: rec.notes, title: rec.title, transcript: rec.transcript })));
    } catch {
      // Keep whatever was already listed — the next toggle retries.
    }
    setOutputsStatus("loaded");
  }, [chatIds, selectedNotebookId]);

  useEffect(() => {
    if (homeTab === "outputs") void loadOutputs();
  }, [homeTab, loadOutputs]);

  // Everything the notebook has produced, newest first: generated deliverables
  // plus recordings captured in any of this notebook's chats.
  const outputCards: SessionOutput[] = useMemo(() => {
    const deliverableCards = deliverables
      .filter((row) => row.status !== "pending")
      .map((row) => ({ createdAt: row.createdAt, id: row.id, kind: row.kind, notes: row.status === "failed" ? "Generation failed — try again." : row.content, title: row.title }));
    return [...previewOutputs, ...deliverableCards, ...recordings].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [deliverables, previewOutputs, recordings]);

  const anyGenerating = Object.values(generating).some(Boolean) || deliverables.some((row) => row.status === "pending");

  const handleGenerate = useCallback((kind: NotebookOutputKind) => {
    if (!selected) return;
    // Deliverables are grounded in the notebook's sources — with nothing
    // attached there is nothing to build from (owner 2026-07-20 evening).
    if (wireSources.length === 0) {
      setStartError("Attach at least one source first — deliverables are built only from this notebook's sources.");
      return;
    }
    setStartError(null);
    setHomeTab("outputs");
    if (preview) {
      setGenerating((current) => ({ ...current, [kind]: true }));
      window.setTimeout(() => {
        setPreviewOutputs((current) => [{ createdAt: new Date().toISOString(), id: `preview-${kind}-${current.length}`, kind, notes: `## ${DELIVERABLE_META[kind].label} — ${selected.name}\n\nThis is a preview build — sign in on the real app to generate from your sources.`, title: `${DELIVERABLE_META[kind].label} — ${selected.name}` }, ...current]);
        setGenerating((current) => ({ ...current, [kind]: false }));
      }, 900);
      return;
    }
    if (!uid) {
      setStartError("Sign in to generate deliverables.");
      return;
    }
    setGenerating((current) => ({ ...current, [kind]: true }));
    void generateNotebookDeliverable({ instructions: selected.instructions, kind, notebookId: selected.id, notebookName: selected.name, sources: wireSources, uid })
      .catch((cause) => setStartError(cause instanceof Error ? cause.message : "Couldn't generate — try again."))
      .finally(() => {
        setGenerating((current) => ({ ...current, [kind]: false }));
        void loadOutputs();
      });
  }, [loadOutputs, preview, selected, uid, wireSources]);

  const startFromPrompt = useCallback(
    async (text: string, files: File[]) => {
      if (!selected) return;
      const prepared = await prepareChatAttachments(text, files, uid);
      if (!prepared.displayText) return;
      setStartError(null);
      if (preview) {
        const existing = chats[0];
        if (!existing) return;
        notebooks.openChat(existing.id);
        notebookChatStore.append(existing.id, { role: "user", content: prepared.displayText, at: new Date().toISOString() });
        notebookChatStore.setWorking(existing.id, true);
        window.setTimeout(() => {
          notebookChatStore.append(existing.id, { role: "assistant", content: PREVIEW_REPLY, at: new Date().toISOString() });
          notebookChatStore.setWorking(existing.id, false);
        }, 600);
        return;
      }
      const chat = await notebooks.startChat(selected.id, titleFromPrompt(text || files[0]?.name || "New chat"));
      if (!chat) {
        setStartError("Couldn't start a chat — check your connection and that you're signed in.");
        return;
      }
      if (!uid) return;
      void sendNotebookTurn({ uid, notebookId: selected.id, chatId: chat.id, instructions: selected.instructions, sources: wireSources, userText: prepared.wireText, displayText: prepared.displayText });
    },
    [selected, preview, chats, uid, wireSources, notebooks],
  );

  // Owner ask 2026-07-20: on the notebook home the recorder stays compact
  // (mode pill + companion panel only); pressing Record creates a chat and
  // hands off to the full chat view, which opens the regular recorder screen.
  const startRecordingChat = useCallback(
    (active: boolean) => {
      if (!active || !selected || startingRecording) return;
      setStartingRecording(true);
      setStartError(null);
      void (async () => {
        try {
          const chat = preview ? (chats[0] ?? null) : await notebooks.startChat(selected.id, "Recording");
          if (!chat) {
            setStartError("Couldn't start a recording — check your connection and that you're signed in.");
            return;
          }
          requestNotebookRecording(chat.id);
          notebooks.openChat(chat.id);
        } finally {
          setStartingRecording(false);
        }
      })();
    },
    [chats, notebooks, preview, selected, startingRecording],
  );

  if (!selected) return null;

  const instructions = selected.instructions?.trim() ?? "";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="workspace-page-header flex shrink-0 items-center gap-1 px-6 pb-2 pt-[calc(var(--titlebar-height)+1rem)] text-[0.85rem] max-sm:px-4">
        <button
          type="button"
          onClick={() => notebooks.select(null)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
        >
          <Codicon name="chevron-left" size="0.8rem" /> Notebooks
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Center: title + composer + Recents */}
        <div className="mx-auto flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pb-8 max-sm:px-4">
          <div className="mx-auto w-full max-w-2xl pt-2">
            <div className="mb-5 flex items-start justify-between gap-4">
              <h1 className="workspace-page-title min-w-0 truncate text-foreground">{selected.name}</h1>
              <NotebookProjectMenu />
            </div>

            <NotebookComposer onRecordingChange={startRecordingChat} onSubmit={startFromPrompt} placeholder="Ask a question" large autoFocus />
            {startError && <p className="mt-2 text-[0.8rem] text-(--dt-destructive)">{startError}</p>}

            <div className="mt-8">
              <div className="mb-3">
                <SegmentedControl
                  className="w-fit bg-[color-mix(in_srgb,var(--ui-base)_6%,transparent)]"
                  onChange={setHomeTab}
                  options={[{ id: "chats" as const, label: "Chats" }, { id: "outputs" as const, label: "Outputs" }]}
                  value={homeTab}
                />
              </div>
              {homeTab === "outputs" ? (
                <div className="flex flex-col gap-2">
                  {anyGenerating && (
                    <div aria-label="Generating output" className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-background px-3.5 py-3">
                      <span className="size-8 shrink-0 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="h-3 w-2/3 animate-pulse rounded bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]" />
                        <span className="h-2.5 w-1/3 animate-pulse rounded bg-[color-mix(in_srgb,var(--ui-base)_8%,transparent)]" />
                      </span>
                    </div>
                  )}
                  {outputsStatus !== "loaded" && outputCards.length === 0 && !anyGenerating ? (
                    <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">Loading outputs…</p>
                  ) : outputCards.length === 0 && !anyGenerating ? (
                    <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">No outputs yet — record a session, or generate flashcards, a test, or slides from the panel on the right.</p>
                  ) : (
                    outputCards.map((output) => <OutputCard key={output.id} output={output} />)
                  )}
                </div>
              ) : chatsStatus === "loading" ? (
                <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">Loading chats…</p>
              ) : chats.length === 0 ? (
                <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">No chats yet — ask something above to start one.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {chats.map((c) => (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => notebooks.openChat(c.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-background px-3.5 py-3 pr-10 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-colors hover:bg-(--ui-control-hover-background)"
                      >
                        <Codicon name="comment-discussion" size="0.9rem" className="shrink-0 text-(--ui-text-tertiary)" />
                        <span className="min-w-0 flex-1 truncate text-[0.9rem] text-foreground">{c.title}</span>
                        {formatModified(c.updatedAt) && (
                          <span className="shrink-0 text-[0.7rem] tabular-nums text-(--ui-text-quaternary)">{formatModified(c.updatedAt)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${c.title}`}
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete “${c.title}”? This can't be undone.`)) void notebooks.removeChat(c.id);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-active-background) hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Codicon name="trash" size="0.75rem" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right rail — floats on the page background (no distinct column/slab), like Claude's. */}
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto px-3 pb-6 pt-5 max-lg:hidden">
          {/* One rounded panel; dividers separate the sections (no nested boxes). */}
          <div className="divide-y divide-(--ui-stroke-secondary) overflow-hidden rounded-[1.5rem] border border-(--ui-stroke-secondary) bg-background shadow-[0_2px_8px_rgba(0,0,0,0.025)]">
            <section className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[0.8rem] font-semibold uppercase tracking-wide text-foreground">Instructions</h2>
                <button
                  type="button"
                  aria-label="Edit instructions"
                  onClick={() => setInstrOpen(true)}
                  className="rounded-md p-1 text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
                >
                  <Codicon name={instructions ? "pencil" : "add"} size="0.8rem" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setInstrOpen(true)}
                className={cn(
                  "rounded-lg px-1 py-1 text-left text-[0.82rem] leading-relaxed transition-colors hover:bg-(--ui-control-hover-background)",
                  instructions ? "text-foreground" : "text-(--ui-text-secondary)",
                )}
              >
                {instructions ? (
                  <span className="line-clamp-4 whitespace-pre-wrap">{instructions}</span>
                ) : (
                  "Add instructions to tailor Nemesis's answers in this notebook."
                )}
              </button>
            </section>

            <NotebookSourcesCard
              notebookId={selected.id}
              uid={uid}
              sources={sources}
              sourcesStatus={sourcesStatus}
              addLibrary={notebooks.addLibrary}
              addExtracted={notebooks.addExtracted}
              removeSource={notebooks.removeSource}
            />

            <section className="flex flex-col gap-2 p-3">
              <h2 className="text-[0.8rem] font-semibold uppercase tracking-wide text-foreground">Create</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["flashcards", "test", "slides", "mindmap"] as const).map((kind) => (
                  <button
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-(--ui-stroke-tertiary) bg-background px-2 py-3 text-[0.76rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:opacity-55"
                    disabled={Boolean(generating[kind]) || wireSources.length === 0}
                    key={kind}
                    onClick={() => handleGenerate(kind)}
                    type="button"
                  >
                    <Codicon name={DELIVERABLE_META[kind].icon} size="1rem" />
                    {DELIVERABLE_META[kind].label}
                  </button>
                ))}
              </div>
              <p className="text-[0.72rem] leading-relaxed text-(--ui-text-quaternary)">
                {wireSources.length === 0
                  ? "Attach at least one source first — deliverables are built only from this notebook's sources."
                  : "Built from this notebook's sources. Results land under Outputs."}
              </p>
            </section>
          </div>
        </aside>
      </div>

      <NotebookInstructionsDialog
        open={instrOpen}
        onOpenChange={setInstrOpen}
        initialValue={selected.instructions ?? ""}
        onSave={(value) => void notebooks.saveInstructions(selected.id, value)}
      />
    </div>
  );
}

