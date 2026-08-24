"use client";

// Library — the home of what Nemesis has made for the learner.
//
// Owner 2026-08-25: "the library will be where Nemesis will output any reports or notes and
// presentations and flashcards", with the canvases themselves moving to the sidebar the same
// day (sidebar-canvases.tsx). So the page's primary objects change for the second time:
// files → canvases (§L, 2026-08-13) → OUTPUTS (this). The canvas manager it replaces is not
// deleted — /dev-preview/library still renders it — but no shipped route mounts it now.
//
// 🔴 EVERY ROW OPENS THE REAL THING. A deck starts an actual review (the same
// study_decks/study_cards rows the grading RPC schedules); a note opens in the library's own
// reader at /library/classic. Nothing here is a picture of an artifact.
//
// 🔴🔴 PRESSING A DECK REVIEWS IT. IT USED TO JUST UNROLL THE TEXT. Owner 2026-08-24, on
// what a deck in here is for: "I kinda just want … the cards as an artifact that the user can
// study". Reading a list of answers is the one thing a flashcard is designed to prevent, so
// the list is demoted to a deliberate peek behind the chevron and the row itself opens
// `DeckReview` — the Study tab's own screen, unchanged. Same for the `?deck=` deep link a
// canvas sends: a canvas linking here means "go study this", not "go read this".
//
// 🔴 READS ONLY WHAT EXISTS. Decks come from study_decks, notes from
// readable_library_documents — the two stores canvas-deliverables.ts writes. When slides and
// reports earn a real home they earn a section; a section over an empty table would render
// forever-empty shelves and read as broken (the §38.3 lesson).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  FolderPlus,
  Folder as FolderIcon,
  GraduationCap,
  ImagePlus,
  Layers,
  MonitorPlay,
  NotebookText,
  Share2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { DeckDesignPicker, useDeckDesignChoice } from "@/components/workspace/deck/deck-design-picker";
import { DeckReview } from "@/components/workspace/study/deck-review";
import { DeckOcclusion } from "./deck-occlusion";
import { DeckShare } from "./deck-share";
import { createFolder, listFolders, type Folder } from "@/lib/learn/canvas-store";
import { fileOutput, type OutputKind } from "@/lib/workspace/library-filing";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface DeckRow {
  id: string;
  name: string;
  createdAt: string;
  cards: number;
  folderId: string | null;
}

interface NoteRow {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
  folderId: string | null;
}

interface Card {
  id: string;
  front: string;
  back: string;
}

interface SlidesRow {
  assetId: string;
  canvasId: string | null;
  title: string;
  createdAt: string;
  folderId: string | null;
}

/**
 * Which shelf the learner is looking at.
 *
 * 🔴🔴 A FILTER, NOT A NAVIGATION. Owner 2026-08-24, naming ChatGPT's library as the reference:
 * *"make sure you add the flashcards, slides, or documents, selection, or filter."* Every choice
 * here narrows ONE page that is already loaded — it does not route, does not refetch, and does not
 * change what "the Library" means. That is why "All" exists and is the default: a learner who has
 * not chosen anything must see everything, or the shelves they did not pick look deleted.
 *
 * 🔴 AND IT IS NOT A CONTROL OVER THE LEARNING MACHINE, so §38 has no quarrel with it. It steers
 * a list of files the learner already owns; nothing here reaches the composer or the policy.
 */
type Shelf = "all" | OutputKind;

const SHELVES: readonly { id: Shelf; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deck", label: "Flashcards" },
  { id: "slides", label: "Slides" },
  { id: "note", label: "Documents" },
];

const SECTION_TITLE = "px-1 pb-2 text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-secondary)";
const ROW =
  "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:bg-(--ui-control-hover-background)";

function when(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export function LibraryOutputs({ userId }: { userId: string | null }) {
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, Card[]>>({});
  const [slides, setSlides] = useState<SlidesRow[]>([]);
  // Which deck is being REVIEWED. Held apart from `openDeck` (which only peeks at the
  // text) because mounting DeckReview is what triggers the whole-account study load —
  // see its header. Null means nothing is mounted and nothing has been fetched.
  const [reviewing, setReviewing] = useState<string | null>(null);
  // 🔴 THE LAST TWO REASONS TO VISIT THE RETIRED STUDY TAB (workstream F). Both mount the Study
  // tab's own screens unchanged — see `study-extras.tsx` — and both stay unmounted until pressed,
  // because each reaches `useCloudStudy()` and that loads the whole account.
  // 🔴 THE REFRESH COUNTER WENT WITH THE ANKI IMPORT (owner, 2026-08-24). It existed so a bulk
  // import could re-run the shelves' one effect without a manual reload; with no bulk import there
  // is nothing to re-run for, and an unused setter is a door left standing after its room is gone.
  // 🔴 SHARING IS PUBLISHING, so it is one deliberate press on one named deck — never a default,
  // never applied in bulk. `sharing` holds the deck whose link panel is open.
  const [sharing, setSharing] = useState<DeckRow | null>(null);
  /**
   * The deck having image cards added to it.
   *
   * 🔴 UNMOUNTED UNTIL PRESSED, for the same reason `reviewing` is: the editor reaches
   * `useCloudStudy()`, which loads every deck, card and review on the account.
   */
  const [occluding, setOccluding] = useState<DeckRow | null>(null);
  // 🔴 THE SHELF FILTER AND THE OPEN FOLDER ARE INDEPENDENT, AND BOTH ARE VIEW STATE ONLY. Neither
  // refetches: every row is already in hand (200 per shelf), so narrowing is a `filter` and
  // switching back is instant. A learner who files a deck and then changes the filter must not
  // watch the page reload to show them something it already had.
  const [shelf, setShelf] = useState<Shelf>("all");
  const [folders, setFolders] = useState<Folder[]>([]);
  /** null means "everything, wherever it is filed" — the arrival view. */
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [deckRes, noteRes, slidesRes, folderList] = await Promise.all([
        supabase
          .from("study_decks")
          .select("id,name,created_at,folder_id,study_cards(count)")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("readable_library_documents")
          .select("id,path,title,updated_at,folder_id")
          .eq("kind", "note")
          .eq("deleted", false)
          .order("updated_at", { ascending: false })
          .limit(200),
        // Slides live as their PLAN on the canvas that made them; the assets ledger is what
        // lets this page list them without loading every canvas. Download loads the one
        // canvas and rebuilds the file from the stored plan.
        supabase
          .from("assets")
          .select("id,title,created_at,folder_id,canvas_outputs(canvas_id)")
          .eq("kind", "generated_slides")
          .eq("deleted", false)
          .order("created_at", { ascending: false })
          .limit(200),
        // The SAME tree the sidebar files canvases into — see `library-filing.ts`.
        listFolders(userId),
      ]);
      if (!alive) return;
      if (!deckRes.error && deckRes.data) {
        setDecks(
          (deckRes.data as { id: string; name: string; created_at: string; folder_id: string | null; study_cards: { count: number }[] }[]).map(
            (row) => ({
              cards: row.study_cards?.[0]?.count ?? 0,
              createdAt: row.created_at,
              folderId: row.folder_id,
              id: row.id,
              name: row.name,
            }),
          ),
        );
      }
      if (!noteRes.error && noteRes.data) {
        setNotes(
          (noteRes.data as { id: string; path: string; title: string; updated_at: string; folder_id: string | null }[]).map((row) => ({
            folderId: row.folder_id,
            id: row.id,
            path: row.path,
            title: row.title,
            updatedAt: row.updated_at,
          })),
        );
      }
      if (!slidesRes.error && slidesRes.data) {
        setSlides(
          (slidesRes.data as { id: string; title: string; created_at: string; folder_id: string | null; canvas_outputs: { canvas_id: string }[] }[]).map(
            (row) => ({
              assetId: row.id,
              canvasId: row.canvas_outputs?.[0]?.canvas_id ?? null,
              createdAt: row.created_at,
              folderId: row.folder_id,
              title: row.title,
            }),
          ),
        );
      }
      setFolders(folderList);
      } finally {
        // A thrown fetch (offline, blocked) must still land on the empty states — a page
        // that says "Loading…" forever reads as broken, not as empty.
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  /**
   * Move a row, and show it moved without refetching the page.
   *
   * 🔴 THE LOCAL STATE IS UPDATED ONLY AFTER THE WRITE LANDS. An optimistic move that the database
   * then refused (the cross-account folder trigger) would leave the learner looking at a folder
   * their deck is not in, and they would find out on the next reload.
   */
  const file = useCallback(async (kind: OutputKind, id: string, folderId: string | null) => {
    if (!(await fileOutput(kind, id, folderId))) return;
    if (kind === "deck") setDecks((was) => was.map((row) => (row.id === id ? { ...row, folderId } : row)));
    if (kind === "note") setNotes((was) => was.map((row) => (row.id === id ? { ...row, folderId } : row)));
    if (kind === "slides") setSlides((was) => was.map((row) => (row.assetId === id ? { ...row, folderId } : row)));
  }, []);

  /**
   * Naming a new folder, inline in the folder bar.
   *
   * 🔴 AN INPUT IN THE BAR, NOT `window.prompt`. The first version of this used the browser's
   * prompt, which is unstyled, modal to the whole tab, suppressible by the browser, and unlike
   * every other input in this app. The sidebar already names a new folder inline; this is the same
   * gesture in the row the folder is about to appear in. `naming` is the draft text, or null when
   * nothing is being named.
   */
  const [naming, setNaming] = useState<string | null>(null);

  /**
   * 🔴🔴 THE NAME IS AN ARGUMENT, NOT READ FROM STATE, AND THAT IS THE WHOLE CORRECTNESS ARGUMENT.
   * Committing happens on Enter AND on blur, and Escape has to cancel a blur it causes itself. A
   * version that read `naming` from the closure could not: `setNaming` does not update the already-
   * mounted blur handler, so cancelling with a name typed created the folder anyway on the way out.
   * Taking the value from the event means every caller passes what the input holds AT THAT MOMENT,
   * and Escape simply empties the input first — an empty name is already a no-op here.
   */
  const addFolder = useCallback(
    async (raw: string) => {
      const name = raw.trim();
      setNaming(null);
      if (!name) return;
      const made = await createFolder(userId, name);
      // 🔴 A REFUSED CREATE LEAVES THE LIST ALONE. `createFolder` returns null when the database
      // refuses — the two-level depth trigger raises rather than nesting deeper — and pushing a
      // folder that does not exist would give the learner somewhere to file things that vanishes.
      if (made) setFolders((was) => [...was, made].sort((a, b) => a.name.localeCompare(b.name)));
    },
    [userId],
  );

  // 🔴 ONE PREDICATE, APPLIED TO ALL THREE SHELVES. Writing the folder test into each list is how
  // the three quietly come to disagree about what "unfiled" means.
  const inFolder = useCallback(
    <T extends { folderId: string | null }>(rows: readonly T[]): readonly T[] =>
      openFolder === null ? rows : rows.filter((row) => row.folderId === openFolder),
    [openFolder],
  );

  const shownDecks = useMemo(() => inFolder(decks), [decks, inFolder]);
  const shownNotes = useMemo(() => inFolder(notes), [notes, inFolder]);
  const shownSlides = useMemo(() => inFolder(slides), [slides, inFolder]);

  /** How many outputs of any kind sit in each folder — a folder chip that never says 0 is a lie. */
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (id: string | null) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
    decks.forEach((row) => bump(row.folderId));
    notes.forEach((row) => bump(row.folderId));
    slides.forEach((row) => bump(row.folderId));
    return counts;
  }, [decks, notes, slides]);

  const showing = (which: OutputKind) => shelf === "all" || shelf === which;

  const toggleDeck = useCallback(
    async (id: string) => {
      if (openDeck === id) {
        setOpenDeck(null);
        return;
      }
      setOpenDeck(id);
      if (!cards[id]) {
        const { data, error } = await supabase.from("study_cards").select("id,front,back").eq("deck_id", id).limit(200);
        if (!error && data) setCards((was) => ({ ...was, [id]: data as Card[] }));
      }
    },
    [cards, openDeck],
  );

  // Deep link: /library?deck=<id> starts reviewing that deck — the canvas's Outputs tab
  // links here, and it links here to send the learner into the cards. Read from the
  // location rather than useSearchParams, which would demand a Suspense boundary for one
  // string.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("deck");
    if (id) setReviewing(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on arrival.
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="pb-8">
        {/* 🔴 NO SUBTITLE — owner, 2026-08-24: *"remove the description under the library heading."*
            The shelves say what the page holds, and a sentence explaining a page the learner has
            already opened is the kind of chrome §41 refuses. It also went stale twice in one day. */}
        <h1 className="text-xl font-semibold text-(--ui-text-primary)">Library</h1>
        {/* 🔴🔴 BOTH DOORS REMOVED — owner, 2026-08-24: "the library page has an import from Anki
            button that I don't want. The library also has a progress button that I did not ask for.
            I mainly just want buttons for slides, flash cards, and documents." They arrived here
            when the old Study tab was retired and its surviving features had to live somewhere;
            "somewhere" was read as "the top of the Library", which is the one page a learner opens
            to reach their own work. The shelves below ARE the page.

            🔴 WHAT SITS HERE NOW IS THE THREE THE OWNER NAMED, AS A FILTER RATHER THAN AS BUTTONS.
            "Buttons for slides, flash cards, and documents" on a page whose whole content is
            slides, flashcards and documents can only mean one thing: a way to look at one kind at
            a time. A button that MADE one would be the outputs panel again, which they had just
            asked to have removed. */}
        {/* 🔴🔴 ONE ROW OF PILLS, AND THE SECOND ROW IS GONE — the owner's catch: *"why is there an
            everything button if we already have the all button"*. Exactly right: a kind filter whose
            selected state reads "All", stacked above a folder filter whose selected state reads
            "Everything", is two controls saying the same English word. The reference they pointed at
            (ChatGPT's library) has no second row at all — one row of kind pills, and folders are
            ROWS IN THE LIST you open. So folders moved into the list, and "Everything" stopped
            needing to exist: being in no folder is simply the top of the list.

            🔴 IT ALSO MAKES THE COUNT HONEST. A chip reading "Fall 2026 · 3" was counted across all
            three kinds while these pills might be showing only one of them. A folder you OPEN just
            shows what is in it. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {SHELVES.map((option) => (
              <button
                aria-pressed={shelf === option.id}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[length:var(--canvas-text-small)] transition-colors",
                  shelf === option.id
                    ? "bg-(--ui-bg-tertiary) font-medium text-(--ui-text-primary)"
                    : "bg-transparent text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)",
                )}
                key={option.id}
                onClick={() => setShelf(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* 🔴 ONLY AT THE TOP LEVEL. Folders nest two deep in the database and the sidebar already
              spends that second level; offering "New folder" from inside one would either make a
              third level the trigger refuses, or quietly make a sibling, and neither is what the
              button says.

              🔴 `--ui-text-secondary`, NOT `--ui-text-quaternary`. Measured against the reference
              in dark mode: quaternary resolves to white at 36% on a pure-black ground, which is a
              control you have to hunt for. ChatGPT's equivalent is a solid, prominent button;
              secondary (74%) is this app's nearest honest equivalent and reads in both themes. The
              unselected filter pills use the same token, so the row speaks with one voice. */}
          {openFolder === null && naming === null && (
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-transparent px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-primary)"
              onClick={() => setNaming("")}
              type="button"
            >
              <FolderPlus size={14} strokeWidth={1.8} />
              New folder
            </button>
          )}
        </div>

        {/* 🔴🔴 THERE IS NO SECOND ROW OF PILLS, AND REMOVING IT WAS THE OWNER'S CATCH: *"why is
            there an everything button if we already have the all button"*. Exactly right — a kind
            filter reading "All" above a folder filter reading "Everything" is two controls whose
            selected state is the same English word, stacked. The reference they pointed at
            (ChatGPT's library) does not have the second row at all: it has ONE row of kind pills,
            and folders are ROWS IN THE LIST you open. So folders moved into the list below, and
            "Everything" stopped needing to exist — being in no folder is just the top of the list.

            🔴 WHICH ALSO MAKES THE COUNT HONEST. A chip saying "Fall 2026 · 3" had to be computed
            across all three shelves while the pills above might be showing only one of them; a
            folder you OPEN just shows what is in it. */}
      </header>

      {/* 🔴 FOLDERS ARE ROWS, ABOVE THE SHELVES, THE WAY THE REFERENCE DOES IT. They are not
          filtered by the kind pills: a folder holds decks, slides and notes at once, so hiding it
          because the learner is looking at slides would hide the slides inside it too. */}
      {openFolder === null && (folders.length > 0 || naming !== null) && (
        <section className="pb-6">
          <ul className="flex flex-col gap-0.5">
            {folders.map((folder) => (
              <li key={folder.id}>
                <button className={cn(ROW, "w-full")} onClick={() => setOpenFolder(folder.id)} type="button">
                  <FolderIcon className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
                    {folder.name}
                  </span>
                  <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                    {folderCounts.get(folder.id) ?? 0} item{(folderCounts.get(folder.id) ?? 0) === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
            {naming !== null && (
              <li className={cn(ROW, "gap-3")}>
                <FolderIcon className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                <input
                  aria-label="Name the new folder"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[length:var(--canvas-text-small)] text-(--ui-text-primary) outline-none"
                  maxLength={120}
                  // Enter commits, clicking away commits, Escape abandons.
                  onBlur={(event) => void addFolder(event.currentTarget.value)}
                  onChange={(event) => setNaming(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addFolder(event.currentTarget.value);
                    if (event.key === "Escape") {
                      // 🔴 EMPTY THE INPUT ITSELF, NOT THE STATE. Whatever blur follows this reads
                      // the DOM node's value, so clearing it here is what makes cancelling actually
                      // cancel, with no assumption about when React next renders.
                      event.currentTarget.value = "";
                      setNaming(null);
                    }
                  }}
                  placeholder="Folder name"
                  value={naming}
                />
              </li>
            )}
          </ul>
        </section>
      )}

      {/* 🔴 THE WAY BACK OUT, AND THE ONLY THING THAT SAYS WHERE YOU ARE. Without it a folder with
          two decks in it is indistinguishable from an account with two decks in it. */}
      {openFolder !== null && (
        <button
          className="mb-4 flex items-center gap-2 rounded-xl bg-transparent px-3 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background)"
          onClick={() => setOpenFolder(null)}
          type="button"
        >
          <ChevronLeft size={15} strokeWidth={1.8} />
          {folders.find((folder) => folder.id === openFolder)?.name ?? "Library"}
        </button>
      )}

      {/* 🔴 A SHELF THE FILTER HAS HIDDEN IS NOT RENDERED AT ALL, heading included. Keeping the
          heading over an empty list would make a filtered-out shelf look like an emptied one. */}
      {showing("deck") && (
      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Flashcard decks</h2>
        {shownDecks.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {!loaded
              ? "Loading…"
              : openFolder !== null
                ? "No decks in this folder."
                : "No decks yet. Ask Nemesis for flashcards in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shownDecks.map((deck) => (
              <li key={deck.id}>
                <div className="flex items-center gap-0.5">
                  <button
                    aria-label={`Review ${deck.name}`}
                    className={cn(ROW, "min-w-0 flex-1")}
                    onClick={() => setReviewing(deck.id)}
                    type="button"
                  >
                    <Layers className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
                      {deck.name}
                    </span>
                    <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                      {deck.cards} card{deck.cards === 1 ? "" : "s"} · {when(deck.createdAt)}
                    </span>
                  </button>
                  {/* The peek. Deliberately secondary and deliberately still here: reading
                      the answers is sometimes what you want (checking what Nemesis made
                      before trusting it), it just must not be what pressing a deck does. */}
                  <FolderPicker
                    current={deck.folderId}
                    folders={folders}
                    label={`Move ${deck.name} to a folder`}
                    onFile={(folderId) => void file("deck", deck.id, folderId)}
                  />
                  {/* 🔴 IMAGE OCCLUSION'S ONLY DOOR — see `deck-occlusion.tsx`. The editor has
                      worked for weeks with nothing in the product able to open it. */}
                  <button
                    aria-label={`Add image cards to ${deck.name}`}
                    className="shrink-0 rounded-lg p-2 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)"
                    onClick={() => setOccluding(deck)}
                    title="Add image cards"
                    type="button"
                  >
                    <ImagePlus size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    aria-label={`Share ${deck.name}`}
                    className="shrink-0 rounded-lg p-2 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)"
                    onClick={() => setSharing(deck)}
                    type="button"
                  >
                    <Share2 size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    aria-expanded={openDeck === deck.id}
                    aria-label={openDeck === deck.id ? `Hide the cards in ${deck.name}` : `Show the cards in ${deck.name}`}
                    className="shrink-0 rounded-lg p-2 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)"
                    onClick={() => void toggleDeck(deck.id)}
                    type="button"
                  >
                    <ChevronDown className={cn("transition-transform", openDeck === deck.id && "rotate-180")} size={15} strokeWidth={1.8} />
                  </button>
                </div>
                {openDeck === deck.id && (
                  <div className="mb-2 ml-8 mr-2 max-h-80 overflow-y-auto rounded-xl border border-(--ui-stroke-tertiary)">
                    {(cards[deck.id] ?? []).map((card) => (
                      <div className="border-b border-(--ui-stroke-tertiary)/60 px-3 py-2 last:border-b-0" key={card.id}>
                        <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{card.front}</p>
                        <p className="mt-0.5 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
                          {card.back}
                        </p>
                      </div>
                    ))}
                    {!cards[deck.id] && (
                      <p className="px-3 py-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Loading…</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {showing("slides") && (
      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Slides</h2>
        {shownSlides.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {!loaded
              ? "Loading…"
              : openFolder !== null
                ? "No slide decks in this folder."
                : "No slide decks yet. Ask Nemesis for a PowerPoint in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shownSlides.map((row) => (
              <SlidesShelfRow
                folders={folders}
                key={row.assetId}
                onFile={(folderId) => void file("slides", row.assetId, folderId)}
                row={row}
              />
            ))}
          </ul>
        )}
      </section>
      )}

      {showing("note") && (
      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Documents</h2>
        {shownNotes.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {!loaded
              ? "Loading…"
              : openFolder !== null
                ? "No documents in this folder."
                : "No documents yet. Ask Nemesis for a summary or a write-up in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shownNotes.map((note) => (
              <li className="flex items-center gap-0.5" key={note.path}>
                {/* The library's own reader, deep-linked — the same route the canvas panel and
                    /slides already use. */}
                <a className={cn(ROW, "min-w-0 flex-1 no-underline")} href={`/library/classic?note=${encodeURIComponent(note.path)}`}>
                  <NotebookText className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
                    {note.title}
                  </span>
                  <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                    {when(note.updatedAt)}
                  </span>
                </a>
                <FolderPicker
                  current={note.folderId}
                  folders={folders}
                  label={`Move ${note.title} to a folder`}
                  onFile={(folderId) => void file("note", note.id, folderId)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <footer className="flex items-start gap-2 rounded-xl border border-(--ui-stroke-tertiary) px-4 py-3">
        <GraduationCap className="mt-0.5 shrink-0 text-(--ui-text-tertiary)" size={15} strokeWidth={1.8} />
        <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
          Your canvases live in the sidebar. Everything they make for you is kept here, and both
          use the same folders.
        </p>
      </footer>

      {/* 🔴 CONDITIONAL, NEVER `open={…}`. Mounting DeckReview starts a load of every deck,
          card and review on the account; keeping it unmounted until a learner presses a deck
          is what stops the Library paying that cost on arrival. */}
      {reviewing && <DeckReview deckId={reviewing} onClose={() => setReviewing(null)} />}
      {/* 🔴 The Anki import and Progress dialogs were removed with their buttons (owner,
          2026-08-24). `study-extras.tsx` still exports both components and neither was deleted —
          this page simply no longer offers them. */}
      {sharing && <DeckShare deck={sharing} onClose={() => setSharing(null)} userId={userId} />}
      {occluding && (
        <DeckOcclusion deckId={occluding.id} deckName={occluding.name} onClose={() => setOccluding(null)} />
      )}
    </main>
  );
}

/**
 * The move-to-folder menu that hangs off every row, on every shelf.
 *
 * 🔴 ONE COMPONENT FOR ALL THREE SHELVES, because the three tables are an accident of history and
 * the learner is not supposed to be able to tell. Three copies of this menu would be three places
 * for "No folder" to be spelled differently or to stop working.
 *
 * 🔴 NO "NEW FOLDER…" HERE, DELIBERATELY. Making a folder from inside a move menu means naming it
 * in a prompt while a menu is open over the page, and the menu closing takes the row's context
 * with it. The folder bar at the top makes folders; this menu only files into ones that exist.
 * When there are none it says so rather than opening an empty menu.
 */
function FolderPicker({
  current,
  folders,
  label,
  onFile,
}: {
  current: string | null;
  folders: readonly Folder[];
  label: string;
  onFile: (folderId: string | null) => void;
}) {
  if (folders.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="shrink-0 rounded-lg p-2 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)"
      >
        <FolderIcon size={15} strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={current === null} onClick={() => onFile(null)}>
          No folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {folders.map((folder) => (
          <DropdownMenuItem disabled={current === folder.id} key={folder.id} onClick={() => onFile(folder.id)}>
            {folder.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SlidesShelfRow({
  row,
  folders,
  onFile,
}: {
  row: SlidesRow;
  folders: readonly Folder[];
  onFile: (folderId: string | null) => void;
}) {
  const { choose, designId } = useDeckDesignChoice(row.assetId);
  return (
    <li className="flex items-center gap-1">
      <a
        className={cn(ROW, "min-w-0 flex-1", !row.canvasId && "pointer-events-none opacity-60")}
        href={row.canvasId ? `/deck?c=${row.canvasId}&o=${encodeURIComponent(row.assetId)}` : "#"}
      >
        <MonitorPlay className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
          {row.title}
        </span>
        <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          {when(row.createdAt)}
        </span>
      </a>
      <FolderPicker current={row.folderId} folders={folders} label={`Move ${row.title} to a folder`} onFile={onFile} />
      <DeckDesignPicker designId={designId} onPick={choose} sampleTitle={row.title} />
    </li>
  );
}
