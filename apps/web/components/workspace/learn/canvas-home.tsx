"use client";

// The app's landing surface: one composer, and the learner's sessions below it.
//
// 🔴 NOT A DASHBOARD. No "Good afternoon", no streak, no "4 sessions today", no cards due. The
// first thing someone sees is the place they type, because the product's whole claim is that
// they should not have to decide which tool they want before they can start. Type, upload or
// record — all three create a Canvas session, and that is the only entry path there is.
//
// 🔴 AND THIS IS THE LIBRARY. There is no /library navigation item any more, because the
// learner's durable collection is their Canvas sessions, not a pile of PDFs and notes. Scrolling
// down IS the library experience; a second page showing the same information differently is
// exactly what was removed.
//
// The composer MORPHS rather than being replaced (§24). It is one fixed element whose position
// transitions from the centre of the first screen to the bottom dock as the sessions come into
// view — not a big one that disappears and a small one that appears, which is two components
// pretending to be continuous and always shows the seam.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  createFolder,
  deleteCanvas,
  listCanvases,
  listFolders,
  setCanvasFolder,
  setCanvasPinned,
  type CanvasSummary,
  type Folder,
} from "@/lib/learn/canvas-store";
import { cn } from "@/lib/utils";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { putPending } from "./pending-attachment";
import { RecordingRecoveryNotice } from "./recording-recovery-notice";
import { useCanvasDictation } from "./use-canvas-dictation";

/** How far down the page the composer finishes docking. Short, so the transition reads as one
 *  movement rather than something that tracks the scrollbar. */
const DOCK_AFTER_PX = 120;

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docked, setDocked] = useState(false);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  /** The whole page is a drop target, not just the composer — the copy has always said "drop a
   *  file in", and a learner dragging a PDF aims at the page, not at a 28px control. */
  const [draggingOver, setDraggingOver] = useState(false);
  const dictation = useCanvasDictation();
  /** Text typed before dictation started, so switching between talking and the keyboard
   *  mid-sentence throws away neither half. Same contract as the session composer. */
  const typedBefore = useRef("");
  const listening = dictation.listening;

  const refresh = useCallback(async () => {
    const [rows, dirs] = await Promise.all([listCanvases(userId), listFolders(userId)]);
    setSessions(rows);
    setFolders(dirs);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dictation writes into the same box typing does — the composer has one value, whatever produced
  // it. Keyed on both flags so the final transcript still lands after recognition stops.
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return;
    setText([typedBefore.current, dictation.transcript].filter(Boolean).join(" ").trimStart());
  }, [dictation.listening, dictation.transcript]);

  // One element, two positions. The scroll position decides which, and CSS moves it.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onScroll = () => setDocked(node.scrollTop > DOCK_AFTER_PX);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  const start = () => {
    const topic = text.trim();
    // A canvas is addressed by query string, and a brand-new one has no id yet — the canvas
    // surface mints it. The opening instruction rides along so the learner does not have to
    // retype what they already said.
    router.push(topic ? `/learn?ask=${encodeURIComponent(topic)}` : "/learn");
  };

  /**
   * Material dropped or picked on the front door.
   *
   * 🔴 THIS REPLACES A CONTROL THAT DID NOTHING. The `+` here was labelled "Add material" and its
   * handler was `router.push("/learn")` — the page it was already on. It rendered, it hovered, it
   * accepted the click, and nothing happened. Upload was still reachable one step in (start a
   * canvas, then attach), so nothing was lost; the front door simply lied about having it.
   *
   * `?new=1` is what makes the canvas surface mount instead of this page. It carries no id, so
   * `useCanvasSession(null)` mints a fresh canvas, and the files are claimed once it exists.
   */
  const startWithFiles = (files: FileList | readonly File[]) => {
    if (Array.from(files).length === 0) return;
    putPending(files);
    router.push("/learn?new=1");
  };

  const startDictation = () => {
    typedBefore.current = text;
    dictation.reset();
    dictation.start();
  };

  /** × — throw the capture away and put the composer back as it was. */
  const cancelDictation = () => {
    dictation.stop();
    dictation.reset();
    setText(typedBefore.current);
  };

  /** ✓ — accept what was heard. It lands in the composer as editable text and does NOT start a
   *  canvas: speech recognition mishears, and auto-submitting would open a canvas on a topic the
   *  learner never said. */
  const acceptDictation = () => dictation.stop();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => (session.title || "New canvas").toLowerCase().includes(needle));
  }, [query, sessions]);

  const pinned = filtered.filter((session) => session.pinnedAt);
  const unpinned = filtered.filter((session) => !session.pinnedAt);
  const byFolder = new Map<string, CanvasSummary[]>();
  const loose: CanvasSummary[] = [];
  for (const session of unpinned) {
    if (session.folderId) byFolder.set(session.folderId, [...(byFolder.get(session.folderId) ?? []), session]);
    else loose.push(session);
  }

  const act = async (job: Promise<unknown>) => {
    await job;
    await refresh();
  };

  return (
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      onDragLeave={(event) => {
        // 🔴 GUARDED BY `currentTarget`. Dragging across a child fires dragleave on the parent, so
        // an unguarded handler flickers the highlight off and on for the whole traversal.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDraggingOver(false);
      }}
      onDragOver={(event) => {
        // Only a file drag. Dragging selected TEXT across the page must not offer to ingest it.
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDraggingOver(true);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDraggingOver(false);
        startWithFiles(event.dataTransfer.files);
      }}
      style={{ ["--canvas-column" as string]: "680px" }}
    >
      {/* A ring on the surface, not a modal over it: the page stays readable underneath, and
          nothing has to be dismissed if the learner changes their mind mid-drag. */}
      {draggingOver && (
        <div className="pointer-events-none absolute inset-3 z-50 rounded-2xl ring-2 ring-(--ui-action)" />
      )}
      <div className="h-full overflow-y-auto" ref={scroller}>
        {/* First screen: nothing but the question and the place to answer it. */}
        <section className="flex h-full min-h-[26rem] flex-col items-center justify-center px-6">
          <h1 className="text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
            What are you working on?
          </h1>
          {/* Space the morphing composer occupies while it is centred. */}
          <div className="h-[54px] w-full max-w-[770px]" />
          <p className="mt-6 text-[0.8125rem] text-(--ui-text-quaternary)">
            {/* 🔴 THIS NO LONGER PROMISES RECORDING, BECAUSE THIS SURFACE CANNOT DO IT. The line
                used to read "Type it, drop a file in, or record a lecture." Recording is started by
                `RecordWorkspace`, which is hosted only on /sessions and /notebooks — the Canvas has
                no path to it. `recording-recovery-notice.tsx` sits on this very page and says so in
                its own header: it can only offer back a capture that already happened.

                Two of those three were also untrue until this pass: the `+` did nothing and there
                was no dictation. Those are now real, so the copy describes four things this
                composer genuinely does. Wording is my call; the constraint is that it not name a
                capability the front door does not have. */}
            Type a topic, ask a question, dictate it, or drop your material in.
          </p>
        </section>

        <section className="mx-auto w-full max-w-(--canvas-column) px-6 pb-40">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[0.75rem] uppercase tracking-wide text-(--ui-text-quaternary)">Your canvases</h2>
            {sessions.length > 6 && (
              <input
                className="w-[12rem] rounded-lg bg-(--ui-bg-tertiary) px-2.5 py-1.5 text-[0.8125rem] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                value={query}
              />
            )}
          </div>

          {sessions.length === 0 && (
            <p className="mt-6 text-[0.9375rem] text-(--ui-text-tertiary)">
              Nothing yet. Whatever you start above will appear here.
            </p>
          )}

          {pinned.length > 0 && (
            <Group label="Pinned">
              {pinned.map((session) => (
                <SessionRow
                  folders={folders}
                  key={session.id}
                  onDelete={() => void act(deleteCanvas(userId, session.id))}
                  onMove={(folderId) => void act(setCanvasFolder(userId, session.id, folderId))}
                  onOpen={() => router.push(`/learn?c=${session.id}`)}
                  onPin={() => void act(setCanvasPinned(userId, session.id, false))}
                  pinned
                  session={session}
                />
              ))}
            </Group>
          )}

          {folders
            .filter((folder) => (byFolder.get(folder.id) ?? []).length > 0)
            .map((folder) => (
              <Group key={folder.id} label={folder.name}>
                {(byFolder.get(folder.id) ?? []).map((session) => (
                  <SessionRow
                    folders={folders}
                    key={session.id}
                    onDelete={() => void act(deleteCanvas(userId, session.id))}
                    onMove={(folderId) => void act(setCanvasFolder(userId, session.id, folderId))}
                    onOpen={() => router.push(`/learn?c=${session.id}`)}
                    onPin={() => void act(setCanvasPinned(userId, session.id, true))}
                    session={session}
                  />
                ))}
              </Group>
            ))}

          {loose.length > 0 && (
            <Group label={folders.length > 0 ? "Unfiled" : null}>
              {loose.map((session) => (
                <SessionRow
                  folders={folders}
                  key={session.id}
                  onDelete={() => void act(deleteCanvas(userId, session.id))}
                  onMove={(folderId) => void act(setCanvasFolder(userId, session.id, folderId))}
                  onOpen={() => router.push(`/learn?c=${session.id}`)}
                  onPin={() => void act(setCanvasPinned(userId, session.id, true))}
                  session={session}
                />
              ))}
            </Group>
          )}

          {sessions.length > 0 && (
            <button
              className="mt-8 flex items-center gap-1.5 text-[0.75rem] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={() => {
                const name = window.prompt("Folder name");
                if (name?.trim()) void act(createFolder(userId, name.trim()));
              }}
              type="button"
            >
              <Codicon name="new-folder" size="0.75rem" />
              New folder
            </button>
          )}
        </section>
      </div>

      {/* An interrupted recording is offered back here, above the composer — the one place the
          learner is guaranteed to look, so recovery is never something they have to find. It
          renders nothing at all when there is no crashed session, which is almost always. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-4">
        <div className="pointer-events-auto">
          <RecordingRecoveryNotice accessToken={accessToken} />
        </div>
      </div>

      {/* 🔴 ONE composer, two positions. Centred on the first screen, docked once the sessions
          are in view — the same element moving, not one hiding while another appears. */}
      {/* 🔴 `absolute`, NOT `fixed`. Fixed positions against the VIEWPORT, which does not know
          about the workspace sidebar — the composer ran underneath the nav rail and the first
          150px of it were unreachable. Absolute inside this `relative` main is the content
          pane, which is the box it actually belongs to. */}
      <div
        className={cn(
          // 🔴 `flex-col items-center`, NOT `justify-center`. The dictation message below is a
          // SIBLING of the pill; in the row this used to be, it was laid out BESIDE the composer
          // and pushed it off centre instead of sitting under it.
          "pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center px-4 transition-all duration-300 ease-out",
          docked ? "bottom-6 top-auto" : "bottom-auto top-1/2 -translate-y-[calc(50%-1.25rem)]",
        )}
      >
        <div className="pointer-events-auto flex w-full max-w-[770px] min-h-[54px] items-center gap-0 rounded-[27px] bg-(--ui-bg-elevated) px-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
          {/* 🔴 A REAL FILE INPUT, NOT A BUTTON THAT ROUTES. `sr-only`, never `hidden`: a hidden
              input leaves the tab order and the accessibility tree, which makes the label wrapping
              it unreachable by keyboard — the same rule the session composer's attach control
              carries, for the same reason. */}
          <label
            aria-label="Add material"
            className="flex h-[28px] w-[28px] shrink-0 cursor-pointer items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--ui-action)"
            title="Add material"
          >
            <Codicon name="add" size="0.875rem" />
            <input
              accept=".pdf,.docx,.pptx,.md,.txt,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.heic"
              className="sr-only"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) startWithFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          {listening ? (
            <>
              <div className="ml-[12px] flex min-w-0 flex-1 items-center">
                <CanvasVoiceBars live />
              </div>
              <button
                aria-label="Cancel dictation"
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                onClick={cancelDictation}
                title="Cancel dictation"
                type="button"
              >
                <Codicon name="close" size="0.875rem" />
              </button>
              <button
                aria-label="Finish dictation"
                className="ml-[10px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-opacity hover:opacity-90"
                onClick={acceptDictation}
                title="Finish dictation"
                type="button"
              >
                <Codicon name="check" size="0.875rem" />
              </button>
            </>
          ) : (
            <>
              <input
                // 🔴 16px, NOT `text-[1rem]`. This file's root is 112.5%, so `1rem` renders at 18px.
                // The number that matters is 16: below it, iOS Safari zooms the whole viewport in on
                // focus and there is no way back out that reads as intentional. The session composer
                // carries the same literal for the same reason.
                className="ml-[12px] min-w-0 flex-1 bg-transparent text-[16px] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
                onChange={(event) => {
                  setText(event.target.value);
                  typedBefore.current = event.target.value;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    start();
                  }
                }}
                placeholder="Ask Nemesis…"
                value={text}
              />
              {dictation.supported && (
                <button
                  aria-label="Dictate"
                  className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
                  onClick={startDictation}
                  title="Dictate"
                  type="button"
                >
                  <Codicon name="mic" size="0.875rem" />
                </button>
              )}
              <button
                aria-label="Start"
                className="ml-[8px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
                disabled={!text.trim()}
                onClick={start}
                type="button"
              >
                <Codicon name="arrow-up" size="0.875rem" />
              </button>
            </>
          )}
        </div>
        {/* 🔴 A DENIED MICROPHONE HAS TO SAY SO. Without this the mic button is pressed, nothing
            starts, and nothing appears — indistinguishable from a broken control. Observed exactly
            that while verifying: `SpeechRecognition` exists, so the button renders, but the capture
            never begins and the learner is told nothing. The session composer already prints this;
            the front door was the surface missing it. */}
        {dictation.error && !listening && (
          <p className="mt-2 text-center text-[0.75rem] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
      </div>
    </main>
  );
}

function Group({ label, children }: { label: string | null; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      {label && <p className="mb-1.5 text-[0.75rem] text-(--ui-text-quaternary)">{label}</p>}
      <div>{children}</div>
    </div>
  );
}

/** One session. Minimal on purpose (§26): a name, when it was last worked, and how many things
 *  are worth checking. NOT 87% mastery, 32 flashcards, 15 minutes studied, 7-day streak — that
 *  is a dashboard pretending to be progress, and it is not the product. */
function SessionRow({
  session,
  folders,
  pinned,
  onOpen,
  onPin,
  onMove,
  onDelete,
}: {
  session: CanvasSummary;
  folders: Folder[];
  pinned?: boolean;
  onOpen: () => void;
  onPin: () => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="group relative -mx-3 flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-(--ui-bg-tertiary)/60">
      <button className="min-w-0 flex-1 text-left" onClick={onOpen} type="button">
        <p className="truncate text-[0.9375rem] text-(--ui-text-primary)">{session.title || "New canvas"}</p>
        <p className="text-[0.75rem] text-(--ui-text-quaternary)">{describeWhen(session.updatedAt)}</p>
      </button>

      <button
        aria-label="Session options"
        className="shrink-0 rounded-md p-1 text-(--ui-text-quaternary) opacity-0 transition-opacity hover:text-(--ui-text-primary) group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => setMenu((current) => !current)}
        type="button"
      >
        <Codicon name="kebab-vertical" size="0.75rem" />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-9 z-40 w-[13rem] rounded-xl bg-(--ui-bg-elevated) p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
            <RowAction
              label={pinned ? "Unpin" : "Pin to top"}
              onClick={() => {
                setMenu(false);
                onPin();
              }}
            />
            {folders.map((folder) => (
              <RowAction
                key={folder.id}
                label={`Move to ${folder.name}`}
                onClick={() => {
                  setMenu(false);
                  onMove(folder.id);
                }}
              />
            ))}
            {session.folderId && (
              <RowAction
                label="Remove from folder"
                onClick={() => {
                  setMenu(false);
                  onMove(null);
                }}
              />
            )}
            <RowAction
              danger
              label="Delete"
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RowAction({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={cn(
        "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] hover:bg-(--ui-bg-tertiary)",
        danger ? "text-(--ui-text-tertiary) hover:text-red-500" : "text-(--ui-text-secondary)",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

/** Relative, and honest about not knowing. */
function describeWhen(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
