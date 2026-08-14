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

import { Ellipsis, Folder as FolderIcon, Inbox, PanelsTopLeft, Pin, PinOff, Trash2, type LucideIcon } from "lucide-react";

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
import { ACCEPTED_MATERIAL } from "@/lib/learn/canvas-tasks";
import { cn } from "@/lib/utils";
import { CanvasRecorder } from "./canvas-recorder";
import { CanvasVoiceBars } from "./canvas-voice-bars";
import { putPending } from "./pending-attachment";
import { RecordingRecoveryNotice } from "./recording-recovery-notice";
import { useCanvasDictation } from "./use-canvas-dictation";

export function CanvasHome({ accessToken = null, userId }: { accessToken?: string | null; userId: string | null }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<CanvasSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
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
  /** Record mode on the front door. A lecture recorded here has no canvas yet, so it starts one —
   *  the same thing dropping a file here does. */
  const [recording, setRecording] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);
  const addMenu = useRef<HTMLDivElement>(null);

  // Closes on a press elsewhere and on Escape — without the second it is a trap for a keyboard.
  useEffect(() => {
    if (!addOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!addMenu.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setAddOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addOpen]);

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

  // 🔴 THE TITLE FILTER WENT WITH THE SEARCH BOX. Nothing could set a query once the field was
  // removed, so it was a `useMemo` that always returned `sessions` — dead code kept "for later",
  // which is how a surface accumulates machinery nobody can reach. When finding a canvas becomes a
  // real problem it comes back as one control, with the filter next to it.
  const filtered = sessions;

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
      {/* 🔴 ONE SCREEN, AND THE CANVASES ARE ON IT (owner 2026-08-14: "remove the scrolldown to see
          canvases list"). This was a full-viewport first screen with the learner's own canvases
          underneath, so their work was invisible until they scrolled — and the previous pass tried
          to fix that by leaving a 56px sliver peeking, which is a hint about scrolling drawn in
          layout rather than written in words. The honest fix was to stop hiding them.
          🔴 THE COMPOSER IS IN NORMAL FLOW NOW, AND THE DOCKING MACHINERY IS GONE WITH IT. It was
          absolutely positioned and morphed between two positions as the page scrolled; with
          nothing below the fold there is no scroll to track, no second position to morph to, and
          no `--first-screen-lift` for the two of them to share. A moving part that exists to
          manage a problem the page no longer has is just a moving part.
          Measured on the reference at 1440×783: greeting, 36px, composer, then its rows. */}
      <div className="flex h-full flex-col items-center overflow-y-auto px-6 pb-12 pt-[18vh]" ref={scroller}>
        <section className="flex w-full flex-col items-center">
          <h1 className="text-[length:var(--canvas-text-title)] font-medium tracking-[-0.01em] text-(--ui-text-primary)">
            What are you working on?
          </h1>
          <div className="mt-9 flex w-full flex-col items-center">
        {/* 🔴 THE RECORDER REPLACES THE COMPOSER, IT DOES NOT SIT BESIDE IT. While a lecture is
            being captured there is exactly one thing to do; leaving the text box live underneath
            offers a second. Same position, same width. */}
        {recording ? (
          <div className="pointer-events-auto w-full max-w-[770px]">
            <CanvasRecorder
              // No canvas exists yet on the front door, so a finished recording STARTS one — the
              // identical thing dropping a file here does, through the identical door.
              attach={async (files) => { startWithFiles(files); }}
              onClose={() => setRecording(false)}
            />
          </div>
        ) : (
        <div className="pointer-events-auto flex w-full max-w-[770px] min-h-[54px] items-center gap-0 rounded-[27px] bg-(--ui-bg-elevated) px-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.05)] ring-1 ring-(--ui-stroke-tertiary)">
          {/* 🔴 A REAL FILE INPUT, NOT A BUTTON THAT ROUTES. `sr-only`, never `hidden`: a hidden
              input leaves the tab order and the accessibility tree, which makes the label wrapping
              it unreachable by keyboard — the same rule the session composer's attach control
              carries, for the same reason. */}
          <input
            accept={ACCEPTED_MATERIAL}
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) startWithFiles(event.target.files);
              event.target.value = "";
            }}
            ref={filePicker}
            tabIndex={-1}
            type="file"
          />
          {/* 🔴 UPLOAD AND RECORD SIT TOGETHER, BECAUSE A RECORDING IS MATERIAL. §L lists the front
              door's five behaviours as "type a topic · ask a question · upload material · dictate ·
              record", and the mic to the right of this box is DICTATION — speaking instead of
              typing. Putting record beside it would give the learner two microphones and no way to
              tell which one keeps their lecture. */}
          <div className="relative shrink-0" ref={addMenu}>
            <button
              aria-expanded={addOpen}
              aria-haspopup="menu"
              aria-label="Add material"
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--ui-action)"
              onClick={() => setAddOpen((open) => !open)}
              title="Add material"
              type="button"
            >
              <Codicon name="add" size="0.875rem" />
            </button>
            {addOpen && (
              <div
                className="absolute bottom-[40px] left-0 z-50 w-[220px] overflow-hidden rounded-2xl bg-(--ui-bg-elevated) py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)"
                role="menu"
              >
                <button
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
                  onClick={() => { setAddOpen(false); filePicker.current?.click(); }}
                  role="menuitem"
                  type="button"
                >
                  <Codicon className="text-(--ui-text-tertiary)" name="file" size="16px" />
                  Upload material
                </button>
                <button
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[length:var(--canvas-text-small)] text-(--ui-text-primary) hover:bg-(--ui-bg-tertiary)"
                  onClick={() => { setAddOpen(false); setRecording(true); }}
                  role="menuitem"
                  type="button"
                >
                  <Codicon className="text-(--ui-text-tertiary)" name="record" size="16px" />
                  Record a lecture
                </button>
              </div>
            )}
          </div>
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
                // §46.3-exempt: iOS Safari zooms the viewport on focus below 16px
                // 🔴 A LITERAL, NOT `--canvas-text-body`, EVEN THOUGH THAT TOKEN IS ALSO 16px TODAY.
                // The two agree by coincidence, not by contract: the token is a typographic choice
                // and may be retuned, while 16 here is a hard platform threshold — below it iOS
                // Safari zooms the whole viewport in on focus and there is no way back out that
                // reads as intentional. Binding this to the scale would make a future type tweak
                // silently break input focus on every iPhone. The session composer carries the same
                // literal for the same reason.
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
        )}
        {/* 🔴 A DENIED MICROPHONE HAS TO SAY SO. Without this the mic button is pressed, nothing
            starts, and nothing appears — indistinguishable from a broken control. Observed exactly
            that while verifying: `SpeechRecognition` exists, so the button renders, but the capture
            never begins and the learner is told nothing. The session composer already prints this;
            the front door was the surface missing it. */}
        {dictation.error && !listening && (
          <p className="mt-2 text-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{dictation.error}</p>
        )}
          </div>
          <p className="mt-6 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
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

        {/* 🔴 NO SECTION HEADING AND NO SEARCH FIELD (owner 2026-08-14, pointing at both). The rows
            ARE the section: "YOUR CANVASES" over a list of the learner's canvases names what is
            already obvious, and a search box beside it is chrome for a problem nobody has at six
            items. The reference's landing has neither — composer, then rows. */}
        <section className="mt-8 w-full max-w-[768px]">

          {/* 🔴 NO LONGER "Whatever you start above will appear here." (§46.5). That sentence
              pointed at an element the learner is already looking at and explained where its
              output would land — onboarding narration for a page with one composer on it. What
              remains states the condition and nothing else; the heading above it already says
              what is empty. */}
          {sessions.length === 0 && (
            <p className="mt-6 text-[length:var(--canvas-text-body)] text-(--ui-text-tertiary)">Nothing yet.</p>
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
              className="mt-8 flex items-center gap-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
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
          {/* 🔴 A RECOVERED LECTURE NOW LANDS ON A CANVAS, NOT IN A SESSIONS CHAT. This notice only
              ever renders here, and it used to file what it recovered as a new Sessions
              conversation — a surface the sidebar does not list. Starting a canvas from the
              transcript is the same thing dropping a file on this page does. */}
          <RecordingRecoveryNotice
            accessToken={accessToken}
            onRecovered={(file) => startWithFiles([file])}
            uid={userId}
          />
        </div>
      </div>

    </main>
  );
}

function Group({ label, children }: { label: string | null; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      {label && <p className="mb-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{label}</p>}
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
      <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={onOpen} type="button">
        {/* Same pairing as the Library's list (§38.3): a row says what kind of thing it is, and
            nothing that would have to be derived from data this app does not reliably hold. */}
        <PanelsTopLeft className="shrink-0 text-(--ui-text-quaternary)" size={14} strokeWidth={2} />
        <span className="min-w-0 flex-1">
          <p className="truncate text-[length:var(--canvas-text-body)] text-(--ui-text-primary)">{session.title || "New canvas"}</p>
          <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">{describeWhen(session.updatedAt)}</p>
        </span>
        {pinned && <Pin className="shrink-0 text-(--ui-text-quaternary)" size={11} strokeWidth={2} />}
      </button>

      {/* 🔴 THE SAME DEFECT THE LIBRARY HAD, ON THE SURFACE THE LEARNER ACTUALLY LANDS ON (§38.3).
          This carried `opacity-0` with `group-hover:opacity-100`, so pin, move and delete were
          invisible until the pointer crossed the row — and absent entirely on a touch screen. The
          Library's list was measured and fixed first; this is the same list of the same objects,
          one surface earlier, and fixing only one would have left the owner looking at the
          unfixed one. The label names ITS row rather than being the same words on every row. */}
      <button
        aria-label={`Actions for ${session.title || "New canvas"}`}
        className="shrink-0 rounded-md p-1 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:bg-(--ui-bg-tertiary) focus-visible:text-(--ui-text-primary)"
        onClick={() => setMenu((current) => !current)}
        type="button"
      >
        <Ellipsis size={14} strokeWidth={2} />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-9 z-40 w-[13rem] rounded-xl bg-(--ui-bg-elevated) p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
            <RowAction
              icon={pinned ? PinOff : Pin}
              label={pinned ? "Unpin" : "Pin to top"}
              onClick={() => {
                setMenu(false);
                onPin();
              }}
            />
            {folders.map((folder) => (
              <RowAction
                icon={FolderIcon}
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
                icon={Inbox}
                label="Remove from folder"
                onClick={() => {
                  setMenu(false);
                  onMove(null);
                }}
              />
            )}
            <RowAction
              danger
              icon={Trash2}
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

/** 🔴 `icon` IS REQUIRED, NOT OPTIONAL (§38.3). An optional one is an action that can go
 *  undecorated, which is how this menu came to be four lines of plain text. */
function RowAction({
  danger,
  icon: Icon,
  label,
  onClick,
}: {
  danger?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[length:var(--canvas-text-small)] transition-colors hover:bg-(--ui-bg-tertiary)",
        danger ? "text-(--ui-text-tertiary) hover:text-red-500" : "text-(--ui-text-secondary)",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="shrink-0 opacity-70" size={13} strokeWidth={2} />
      <span className="truncate">{label}</span>
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
