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

/** How far down the page the composer finishes docking. Short, so the transition reads as one
 *  movement rather than something that tracks the scrollbar. */
const DOCK_AFTER_PX = 120;

export function CanvasHome({ userId }: { userId: string | null }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docked, setDocked] = useState(false);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [rows, dirs] = await Promise.all([listCanvases(userId), listFolders(userId)]);
    setSessions(rows);
    setFolders(dirs);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    <main className="relative h-full min-h-0 bg-(--ui-bg-editor)" style={{ ["--canvas-column" as string]: "680px" }}>
      <div className="h-full overflow-y-auto" ref={scroller}>
        {/* First screen: nothing but the question and the place to answer it. */}
        <section className="flex h-full min-h-[26rem] flex-col items-center justify-center px-6">
          <h1 className="text-[1.5rem] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
            What are you working on?
          </h1>
          {/* Space the morphing composer occupies while it is centred. */}
          <div className="h-[54px] w-full max-w-[770px]" />
          <p className="mt-6 text-[0.8125rem] text-(--ui-text-quaternary)">
            Type it, drop a file in, or record a lecture.
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

      {/* 🔴 ONE composer, two positions. Centred on the first screen, docked once the sessions
          are in view — the same element moving, not one hiding while another appears. */}
      {/* 🔴 `absolute`, NOT `fixed`. Fixed positions against the VIEWPORT, which does not know
          about the workspace sidebar — the composer ran underneath the nav rail and the first
          150px of it were unreachable. Absolute inside this `relative` main is the content
          pane, which is the box it actually belongs to. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 transition-all duration-300 ease-out",
          docked ? "bottom-6 top-auto" : "bottom-auto top-1/2 -translate-y-[calc(50%-1.25rem)]",
        )}
      >
        <div className="pointer-events-auto flex w-full max-w-[770px] min-h-[54px] items-center gap-0 rounded-[27px] bg-(--ui-bg-elevated) px-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
          <button
            aria-label="Add material"
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            onClick={() => router.push("/learn")}
            type="button"
          >
            <Codicon name="add" size="0.875rem" />
          </button>
          <input
            className="ml-[12px] min-w-0 flex-1 bg-transparent text-[1rem] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                start();
              }
            }}
            placeholder="Ask Nemesis…"
            value={text}
          />
          <button
            aria-label="Start"
            className="ml-[8px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
            disabled={!text.trim()}
            onClick={start}
            type="button"
          >
            <Codicon name="arrow-up" size="0.875rem" />
          </button>
        </div>
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
