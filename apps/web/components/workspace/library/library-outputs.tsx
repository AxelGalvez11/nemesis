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
// reader — `OutputPreview`, the same card the canvas opens (owner 2026-08-25: nothing routes to
// the old library any more). Nothing here is a picture of an artifact.
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
  Download,
  FolderPlus,
  Folder as FolderIcon,
  GraduationCap,
  Layers,
  MonitorPlay,
  NotebookText,
  Search,
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
import { DeckShare } from "./deck-share";
import { deckFileName, deckToAnkiText } from "@/lib/workspace/deck-export";
import { createFolder, listFolders, type Folder } from "@/lib/learn/canvas-store";
import { fileOutput, type OutputKind } from "@/lib/workspace/library-filing";
import { OutputPreview } from "@/components/workspace/learn/output-preview";
import type { CanvasOutput } from "@/lib/learn/canvas-model";
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

/* ── THE GEOMETRY BELOW WAS MEASURED, NOT CHOSEN ─────────────────────────────────────────────
 *
 * 🔴🔴 EVERY LITERAL PIXEL VALUE IN THIS FILE COMES OFF A LIVE, SIGNED-IN CHATGPT LIBRARY PAGE
 * (`getComputedStyle` / `getBoundingClientRect`, viewport 1456px, 2026-08-26). The owner's
 * acceptance condition for this page is "pixel, sizing, spacing and colouring 1 to 1", so an
 * approximation is a failure, not a near miss. Where this app already owns a token that carries
 * the measured value — 14px text, the primary/secondary text colours — the token is used. Where
 * it does not (the page ground, the divider, the row hover) the measured value is written as a
 * literal, because rounding it to the nearest token we happened to have is exactly how a 1:1
 * brief turns into "close enough".
 *
 *   page ground     #fcfcfc (their `--component-sidebar-bg`) — which our `--ui-bg-sidebar`
 *                   already IS in light; NOT white, and copying #fff is the most visible miss
 *   column          768px, centred
 *   title           28px / 500 / 34px line, top edge at y=116
 *   pills           36px tall, padding 0 16px, rounded full, 14px / 500 / 20px line, top at y=204
 *   search          36px tall, 240px wide, 14px, rounded full, leading magnifier
 *   row             60px tall, padding 10px 8px 10px 0, NO radius, NO box, NO shadow
 *   divider         1px bottom, rgba(0,0,0,0.05) light / rgba(255,255,255,0.05) dark
 *   row hover       rgba(0,0,0,0.05) light / rgba(255,255,255,0.10) dark
 *   leading icon    20x20, `--icon-secondary`
 *   name            14px / 400 / `--text-primary`, truncating
 *   meta            14px / `--text-secondary`
 *   column headers  14px / 400 / `--text-secondary`, 20px tall
 *   columns         Name 368 / Modified 160 / Size 88 (Size has padding-left 16px)
 *
 * 🔴🔴🔴 EVERY SIZE AND SPACE ON THIS PAGE IS AN EXPLICIT PX VALUE, BECAUSE ONE REM IS 18px HERE.
 * `globals.css` sets `html { font-size: 112.5% }` to scale the whole desktop-parity UI, so EVERY
 * rem-based Tailwind utility renders 12.5% larger than its name says. `px-4` is 18px, not 16.
 * `h-9` is 40.5px, not 36. `leading-5` is 22.5px, not 20. `size-7` is 31.5px, not 28. `gap-3` is
 * 13.5px, not 12. `max-w-3xl` is 864px, NOT the 768 it is famous for.
 *
 * The first draft of this page used `h-9`, `px-4` and `leading-5` and measured 40.5 / 18 / 22.5 in
 * real Chrome while the source read exactly like the reference. That is the worst shape a bug can
 * take on a 1:1 brief: every class name is the right number and every pixel is wrong, and there is
 * nothing for a reviewer to see. So there is no judgement call here and no "this one is close
 * enough" — anything with a size or a space is written `h-[36px]`, `px-[16px]`, `mr-[12px]`, and a
 * test bans the rem-based steps from this file by name. `globals.css` says it outright too:
 * *"WRITE THESE IN PX, NEVER REM"*.
 *
 * 🔴 THE ROWS ARE DIVIDERS, NOT CARDS. This page used to draw `rounded-xl` boxes with their own
 * hover; the reference draws a flat 60px band whose ONLY separator is a hairline underneath it.
 * A rounded hover on a 60px band reads as a list of buttons, which is a different object.
 */

/**
 * Reference: the 20x20 leading icon plus its 12px gap — 32px before the Name column starts.
 *
 * 🔴 THE GAP IS ON THE ICON, NOT ON THE FLEX CONTAINER. A `gap-3` on the row would put 12px
 * between every pair of columns, and the measured columns (368 / 160 / 88) butt straight up
 * against each other — a table's columns include their own padding. With the gap where it belongs
 * the Name column lands on exactly 368px: 768 − 8 (right pad) − 32 (icon) − 160 − 88 − 112.
 */
const COL_ICON = "mr-[12px] shrink-0 text-(--ui-text-secondary)";
/** Reference: `Modified` column, 160px. */
const COL_MODIFIED = "w-[160px] shrink-0";
/**
 * Reference: the third column (`Size`) is 88px with `padding-left:16px`.
 *
 * 🔴 WE DO NOT HAVE A SIZE, SO WE DO NOT PRINT ONE. A deck's card count is a real number we
 * actually hold, so the deck shelf spends this column on it and labels it "Cards". Slides and
 * documents have nothing to put here, so the column stays EMPTY AND UNLABELLED on those shelves —
 * a header word over nothing, or a column of em dashes forever, would be a promise the page can
 * never keep.
 *
 * 🔴 EMPTY, BUT STILL THERE, AND THAT IS THE POINT. Dropping the column on the shelves without a
 * count moved their `Modified` 88px left, so the three shelves printed their dates in three
 * different places and the page read as three unrelated tables. Holding the space keeps one set
 * of column stops down the whole page AND puts `Name` on the reference's measured 368px on every
 * shelf rather than only on one.
 */
const COL_COUNT = "w-[88px] shrink-0 pl-[16px]";
/**
 * The trailing controls sit in a fixed slot so the columns line up with their own header.
 *
 * 🔴 112px IS DERIVED FROM THE REFERENCE, NOT PICKED. 768 (row) − 8 (right pad) − 368 (Name)
 * − 32 (20px icon + 12px gap) − 160 (Modified) − 88 (Size) = 112 — the space their hover menu
 * lives in. Four 28px controls fit it exactly, which is why the row buttons are `size-[28px]`.
 */
const COL_ACTIONS = "flex w-[112px] shrink-0 items-center justify-end";

/**
 * A shelf's name. 14px / 500 / `--text-primary` — the reference's own section-header type.
 *
 * 🔴 500 HERE, 400 ON `COLUMN_HEAD`, AND THE TWO ARE DIFFERENT OBJECTS. The reference measures a
 * section header at weight 500 and a column header at weight 400; this page has both, stacked,
 * because it has three shelves where the reference has one list.
 *
 * 🔴 24px OF AIR UNDER IT, AS A MARGIN, NOT AS PADDING. Two 14px lines 8px apart read as one
 * block, so the shelf name and the `Name / Modified / Cards` line beneath it ran together. The
 * gap is a margin because padding would sit INSIDE the heading's own box: with `pb-[24px]` the
 * h2's rect ended 20px above the first row, so anything reading the page geometrically — a
 * measuring harness, a screen reader walking boxes — saw a 500-weight heading where the
 * 400-weight column header is. Same pixels on screen, and one of the two is honest about which
 * element is which.
 */
const SECTION_TITLE = "mb-[24px] text-[14px] font-medium text-(--ui-text-primary)";
/**
 * Reference: 14px / weight 400 / `--text-secondary`, 20px tall, sitting above the list.
 *
 * 🔴 `leading-[20px]` IS PART OF THE 20px, NOT DECORATION. The app's body line-height is 1.6, so
 * 14px text draws a 22.4px line box — inside a 20px row that overflows by 1.2px at each end, and
 * the header's own words then hang BELOW the box that is supposed to be 20 tall. Everything reads
 * fine on screen and nothing that measures the page agrees with it.
 */
const COLUMN_HEAD =
  "flex h-[20px] items-center pr-[8px] text-[14px] leading-[20px] font-normal text-(--ui-text-secondary)";
/**
 * One row band: 60px tall, `10px 8px 10px 0`, and a hairline underneath. Hover and divider live
 * HERE, on the whole 768px band, rather than on the clickable part — a row whose trailing controls
 * do not light up with it is two objects pretending to be one.
 */
const ROW =
  "flex h-[60px] items-center border-b border-b-black/[0.05] py-[10px] pr-[8px] text-left transition-colors hover:bg-black/[0.05] dark:border-b-white/[0.05] dark:hover:bg-white/[0.10]";
/** The clickable part of a row: fills the band's 40px content box, never paints its own ground. */
const ROW_MAIN = "flex h-full min-w-0 flex-1 items-center bg-transparent text-left";
/** Name cell: 14px / 400 / `--text-primary`, truncating. */
const ROW_NAME = "min-w-0 flex-1 truncate text-[14px] font-normal text-(--ui-text-primary)";
/** Meta cell (dates, counts): 14px / `--text-secondary` — NOT the 12px quaternary this used. */
const ROW_META = "text-[14px] text-(--ui-text-secondary)";
/** A trailing control: 28x28, four of which fill `COL_ACTIONS` exactly. */
const ROW_ACTION =
  "flex size-[28px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-secondary) transition-colors hover:bg-black/[0.05] hover:text-(--ui-text-primary) disabled:opacity-40 dark:hover:bg-white/[0.10]";
/** Empty-state and loading copy, at the same 14px the rows use. */
const ROW_EMPTY = "py-[12px] text-[14px] text-(--ui-text-secondary)";

function when(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * Rows handed in instead of read from the database, for the dev-only preview route.
 *
 * 🔴🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT, and that is the only thing that makes a
 * measurement of the preview mean anything about the real page. Every class, every column and
 * every control below is the shipped one; the sole difference is where four arrays came from.
 * A preview that re-assembled the surface would prove nothing — see `/dev-preview/library`, which
 * set this rule for the canvas manager, and `/dev-preview/projects`, which follows it.
 *
 * 🔴 IT EXISTS BECAUSE THE 1:1 CLAIM HAS TO BE MEASURED RATHER THAN ASSERTED. The real route is
 * behind a Supabase session, so nothing headless reaches a single row of it, and the row geometry
 * is most of what the owner is accepting.
 */
export interface LibraryPreview {
  readonly decks: readonly DeckRow[];
  readonly notes: readonly NoteRow[];
  readonly slides: readonly SlidesRow[];
  readonly folders: readonly Folder[];
}

export function LibraryOutputs({ preview, userId }: { preview?: LibraryPreview; userId: string | null }) {
  const [decks, setDecks] = useState<DeckRow[]>(() => [...(preview?.decks ?? [])]);
  const [notes, setNotes] = useState<NoteRow[]>(() => [...(preview?.notes ?? [])]);
  /** The document open on screen, as the shape the shared card takes. */
  const [readingNote, setReadingNote] = useState<CanvasOutput | null>(null);
  const [loaded, setLoaded] = useState(preview !== undefined);
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, Card[]>>({});
  const [slides, setSlides] = useState<SlidesRow[]>(() => [...(preview?.slides ?? [])]);
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
  /** The deck currently being written to a file, so its button cannot be pressed twice. */
  const [downloading, setDownloading] = useState<string | null>(null);
  // 🔴 THE SHELF FILTER AND THE OPEN FOLDER ARE INDEPENDENT, AND BOTH ARE VIEW STATE ONLY. Neither
  // refetches: every row is already in hand (200 per shelf), so narrowing is a `filter` and
  // switching back is instant. A learner who files a deck and then changes the filter must not
  // watch the page reload to show them something it already had.
  const [shelf, setShelf] = useState<Shelf>("all");
  /**
   * What the search box holds.
   *
   * 🔴 IT NARROWS, IT DOES NOT FETCH. The reference puts a 240px search on the title row, and a
   * search that went to the server would be a different page — every row is already in hand (200
   * per shelf), so this is the same `filter` the shelf pills are, over the names the learner can
   * already see. An empty box means "everything", exactly like the "All" pill.
   */
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<Folder[]>(() => [...(preview?.folders ?? [])]);
  /** null means "everything, wherever it is filed" — the arrival view. */
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  useEffect(() => {
    // 🔴 THE PREVIEW ROUTE NEVER REACHES THE DATABASE. Its rows are already in state (seeded at
    // mount), and letting the fetch run would overwrite them with the empty results a
    // credential-less environment returns — which is exactly the "no rows to measure" hole this
    // seam exists to close.
    if (preview || !userId) {
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
    // `preview` is a dev-only constant for the life of the route, so it is deliberately not a
    // dependency: the shelves still load on the account and nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * The search box, applied the same way the folder test is: one predicate, all three shelves.
   *
   * 🔴 IT MATCHES THE NAME THE ROW PRINTS, and nothing else. Searching hidden fields (a path, an
   * id) would show the learner rows whose visible text does not contain what they typed, which
   * reads as a broken filter rather than a clever one.
   */
  const matches = useCallback(
    (name: string): boolean => {
      const needle = query.trim().toLowerCase();
      return needle === "" || name.toLowerCase().includes(needle);
    },
    [query],
  );

  const shownDecks = useMemo(() => inFolder(decks).filter((row) => matches(row.name)), [decks, inFolder, matches]);
  const shownNotes = useMemo(() => inFolder(notes).filter((row) => matches(row.title)), [notes, inFolder, matches]);
  const shownSlides = useMemo(() => inFolder(slides).filter((row) => matches(row.title)), [slides, inFolder, matches]);

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

  /**
   * Hand a whole deck to the learner as a file.
   *
   * 🔴 IT FETCHES THE DECK'S OWN CARDS RATHER THAN REUSING THE PEEK. `toggleDeck` caps its read
   * at 200 rows because it is filling a preview list nobody scrolls to the end of; downloading
   * 200 of a 400-card deck and calling it the deck would be a silent, unrecoverable loss the
   * learner only discovers inside Anki.
   *
   * 🔴 EVERY FIELD THE EXPORT NEEDS IS SELECTED HERE. `card_type` decides whether a row is an
   * image card, and asking for it after the fact would mean a second round trip per deck.
   */
  const takeDeck = useCallback(async (deck: DeckRow) => {
    setDownloading(deck.id);
    try {
      const { data, error } = await supabase
        .from("study_cards")
        .select("front,back,tags,card_type")
        .eq("deck_id", deck.id)
        .order("created_at", { ascending: true });
      if (error || !data) return;
      const text = deckToAnkiText(
        (data as { front: string; back: string; tags: string[] | null; card_type: string }[]).map((row) => ({
          back: row.back,
          cardType: row.card_type,
          front: row.front,
          tags: row.tags ?? [],
        })),
      );
      // 🔴 THE OBJECT URL IS REVOKED. Each one pins its blob in memory for the life of the
      // document, and this button is on every row of a page a learner leaves open all day.
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = deckFileName(deck.name);
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }, []);

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
    // 🔴🔴 THE PAGE GROUND IS NOT WHITE, and getting this wrong is the single most visible 1:1
    // miss on the page: the reference paints its page `--component-sidebar-bg` (#fcfcfc), and a
    // pure-white surface beside a tinted sidebar reads as a seam down the middle of the app.
    //
    // 🔴 THE TOKEN, NOT A `#fcfcfc` LITERAL. Our light theme was calibrated against the same app,
    // so `--ui-bg-sidebar` ALREADY resolves to #fcfcfc — the measured value and our token are the
    // same colour, and freezing it as a literal would opt this one page out of the theme system.
    // In dark it deliberately diverges: the reference paints #181818, ours is pure black by an
    // explicit owner decision (2026-08-05), and one page on a different dark ground from every
    // other screen would be a worse failure than the 1:1 miss. The Projects page resolves it the
    // same way, and the two are meant to be indistinguishable when opened back to back.
    //
    // 🔴 AND IT IS THE SCROLLER. The shell hands every route a fixed-height, `overflow-hidden`
    // box (workspace-shell.tsx), so a page that does not scroll itself is simply clipped at the
    // fold — the settings page already solves it exactly this way.
    <div className="scrollbar-dt h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--ui-bg-sidebar) px-[24px]">
      {/* 🔴 768px, CENTRED — and written as the literal because `max-w-3xl` IS NOT 768px HERE.
          It is 48rem, and one rem is 18px on this app, so it renders 864. This page shipped
          `max-w-3xl` for months and was 96px too wide the whole time.
          🔴 THE GUTTER IS ON THE SCROLLER, NOT ON THIS COLUMN. Padding here would eat into the 768
          and put every measured column width (368 / 160 / 88) out by the same amount. */}
      <main className="mx-auto w-full max-w-[768px] pb-[96px]">
        {/* 🔴 THE TITLE'S TOP EDGE LANDS ON y=116, measured. The row is 36px tall (the search box
            sets it) and the 34px title centres inside it, so 115px of padding puts the title's own
            box at 116 — and the pills' 53px margin below puts their top edge on the measured 204. */}
        <header className="pt-[115px] pb-[24px]">
        {/* 🔴 NO SUBTITLE — owner, 2026-08-24: *"remove the description under the library heading."*
            The shelves say what the page holds, and a sentence explaining a page the learner has
            already opened is the kind of chrome §41 refuses. It also went stale twice in one day. */}
        <div className="flex items-center gap-[8px]">
          {/* Reference: 28px / weight 500 / 34px line-height / `--text-primary`. The `mr-auto` is
              what pushes the search and the primary button to the right of the same row, which is
              where the reference's shared frame puts them on every one of its pages. */}
          <h1 className="mr-auto text-[28px] font-medium leading-[34px] text-(--ui-text-primary)">Library</h1>
          {/* 🔴 36px TALL, 240px WIDE, ROUNDED FULL, WITH A LEADING MAGNIFIER — measured off the
              reference's own title row.

              🔴 THE FILL IS THE ONE UNMEASURED VALUE HERE. The reference publishes the field's box
              but not its ground, so this is an outlined pill on the reference's own
              `--border-default` (10% black / 15% white) rather than a guessed grey. It is the same
              string the Projects page uses, because a search box that differed between two pages
              of one frame would be the first thing anyone noticed. */}
          <div className="relative h-[36px] w-[240px] shrink-0">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-[12px] -translate-y-1/2 text-(--ui-text-secondary)"
              size={16}
              strokeWidth={1.8}
            />
            <input
              aria-label="Search the library"
              className="h-full w-full rounded-full border border-black/[0.10] bg-transparent pl-[36px] pr-[12px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-secondary) focus:outline-none dark:border-white/[0.15]"
              onChange={(event) => setQuery(event.target.value)}
              // 🔴 `text`, NOT `search`. WebKit gives `type="search"` its own clear affordance and
              // its own metrics, which is a control the reference does not draw and a box whose
              // height stops being ours. The Projects page's field is `text` for the same reason.
              placeholder="Search library"
              type="text"
              value={query}
            />
          </div>
          {/* 🔴 ONLY AT THE TOP LEVEL. Folders nest two deep in the database and the sidebar already
            spends that second level; offering "New folder" from inside one would either make a
            third level the trigger refuses, or quietly make a sibling, and neither is what the
            button says.

            🔴🔴 IT IS THE SOLID PRIMARY BUTTON THE REFERENCE'S FRAME HAS, not the faint text
            link this used to be. The reference puts one filled pill on every page of this frame
            (its black "New"), and the Library's equivalent is this. It had been drawn in
            `--ui-text-secondary` on transparent, which in dark mode is a control you have to
            hunt for.

            🔴 `--ui-action`, NOT THE REFERENCE'S `#0d0d0d`. The two are three units apart and
            indistinguishable on screen, but `--ui-action` is the product's accent — the owner
            ruled 2026-08-23 that the send button and the mascot follow one colour, and the
            Settings picker writes this token. A literal here would be the one button in the app
            that ignores the learner's chosen accent. The Projects page's "New" is this exact
            string, deliberately: the two pages are meant to be indistinguishable side by side. */}
          {openFolder === null && naming === null && (
            <button
              className="flex h-[36px] shrink-0 items-center gap-[6px] rounded-full bg-(--ui-action) px-[16px] text-[14px] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-80"
              onClick={() => setNaming("")}
              type="button"
            >
              <FolderPlus size={16} strokeWidth={1.8} />
              New folder
            </button>
          )}
        </div>
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
        {/* 🔴 THE PILL ROW'S TOP EDGE LANDS ON y=204 — 53px below a title row that ends at 151. */}
        <div className="mt-[53px] flex flex-wrap items-center gap-[6px]">
          {SHELVES.map((option) => (
            <button
              aria-pressed={shelf === option.id}
              // Reference: 36px tall, padding `0 16px`, rounded full, 14px / 500 / 20px line.
              // 🔴 WEIGHT 500 IN BOTH STATES. Bolding only the selected pill makes the row's
              // labels change width as you press them, which is a wobble the reference has not
              // got — there, selection is carried by the ground and the text colour alone.
              className={cn(
                "flex h-[36px] items-center rounded-full px-[16px] text-[14px] font-medium leading-[20px] transition-colors",
                shelf === option.id
                  ? "bg-[#f3f3f3] text-(--ui-text-primary) dark:bg-[#414141]"
                  : "bg-transparent text-(--ui-text-secondary) hover:bg-black/[0.05] dark:hover:bg-white/[0.10]",
              )}
              key={option.id}
              onClick={() => setShelf(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))}
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
        <section className="pb-[24px]">
          <h2 className={SECTION_TITLE}>Folders</h2>
          <ul className="flex flex-col">
            {/* 🔴 A COUNT IS NOT A DATE, SO IT DOES NOT SIT IN THE DATE COLUMN. This printed
                "3 items" in the same column position where all three shelves below print a
                Modified date, under no header at all — one column saying two different kinds of
                thing. It lives in the count column now, beside the deck shelf's card counts, and
                the Modified column stays empty because a folder genuinely has no modified date.
                An empty cell says "not applicable"; a borrowed `createdAt` under a header reading
                "Modified" would say something false. */}
            <li className={COLUMN_HEAD}>
              <span aria-hidden className="mr-[12px] w-[20px] shrink-0" />
              <span className="min-w-0 flex-1">Name</span>
              <span aria-hidden className={COL_MODIFIED} />
              <span className={COL_COUNT}>Items</span>
              <span aria-hidden className={COL_ACTIONS} />
            </li>
            {folders.map((folder) => (
              <li key={folder.id}>
                <button className={cn(ROW, "w-full")} onClick={() => setOpenFolder(folder.id)} type="button">
                  <FolderIcon className={COL_ICON} size={20} strokeWidth={1.8} />
                  <span className={ROW_NAME}>{folder.name}</span>
                  <span aria-hidden className={COL_MODIFIED} />
                  <span className={cn(COL_COUNT, ROW_META)}>{folderCounts.get(folder.id) ?? 0}</span>
                  <span aria-hidden className={COL_ACTIONS} />
                </button>
              </li>
            ))}
            {naming !== null && (
              <li className={ROW}>
                <FolderIcon className={COL_ICON} size={20} strokeWidth={1.8} />
                <input
                  aria-label="Name the new folder"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-(--ui-text-primary) outline-none"
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
                <span aria-hidden className={COL_MODIFIED} />
                <span aria-hidden className={COL_COUNT} />
                <span aria-hidden className={COL_ACTIONS} />
              </li>
            )}
          </ul>
        </section>
      )}

      {/* 🔴 THE WAY BACK OUT, AND THE ONLY THING THAT SAYS WHERE YOU ARE. Without it a folder with
          two decks in it is indistinguishable from an account with two decks in it. */}
      {openFolder !== null && (
        <button
          className="mb-[16px] -ml-[12px] flex h-[36px] items-center gap-[8px] rounded-full bg-transparent px-[12px] text-[14px] font-medium leading-[20px] text-(--ui-text-secondary) transition-colors hover:bg-black/[0.05] hover:text-(--ui-text-primary) dark:hover:bg-white/[0.10]"
          onClick={() => setOpenFolder(null)}
          type="button"
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
          {folders.find((folder) => folder.id === openFolder)?.name ?? "Library"}
        </button>
      )}

      {/* 🔴 A SHELF THE FILTER HAS HIDDEN IS NOT RENDERED AT ALL, heading included. Keeping the
          heading over an empty list would make a filtered-out shelf look like an emptied one. */}
      {showing("deck") && (
      <section className="pb-[40px]">
        <h2 className={SECTION_TITLE}>Flashcard decks</h2>
        {shownDecks.length === 0 ? (
          <p className={ROW_EMPTY}>
            {!loaded
              ? "Loading…"
              : query.trim() !== ""
                ? "No decks match that."
                : openFolder !== null
                  ? "No decks in this folder."
                  : "No decks yet. Ask Nemesis for flashcards in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {/* 🔴 THE COLUMN HEADER THE REFERENCE HAS AND THIS PAGE DID NOT. Third column is a
                card COUNT, not a byte size: we do not hold a size for a deck, and a column of em
                dashes forever would say "this is broken" rather than "this does not apply". */}
            <li className={COLUMN_HEAD}>
              <span aria-hidden className="mr-[12px] w-[20px] shrink-0" />
              <span className="min-w-0 flex-1">Name</span>
              <span className={COL_MODIFIED}>Modified</span>
              <span className={COL_COUNT}>Cards</span>
              <span aria-hidden className={COL_ACTIONS} />
            </li>
            {shownDecks.map((deck) => (
              <li key={deck.id}>
                <div className={ROW}>
                  <button
                    aria-label={`Review ${deck.name}`}
                    className={ROW_MAIN}
                    onClick={() => setReviewing(deck.id)}
                    type="button"
                  >
                    <Layers className={COL_ICON} size={20} strokeWidth={1.8} />
                    <span className={ROW_NAME}>{deck.name}</span>
                    <span className={cn(COL_MODIFIED, ROW_META)}>{when(deck.createdAt)}</span>
                    <span className={cn(COL_COUNT, ROW_META)}>{deck.cards}</span>
                  </button>
                  <span className={COL_ACTIONS}>
                  {/* The peek. Deliberately secondary and deliberately still here: reading
                      the answers is sometimes what you want (checking what Nemesis made
                      before trusting it), it just must not be what pressing a deck does. */}
                  <FolderPicker
                    current={deck.folderId}
                    folders={folders}
                    label={`Move ${deck.name} to a folder`}
                    onFile={(folderId) => void file("deck", deck.id, folderId)}
                  />
                  {/* 🔴🔴 A HAND-AUTHORING DOOR STOOD HERE FOR ONE DAY, AND THE OWNER REVERSED IT
                      (2026-08-25): *"I don't want users to edit flashcards, really. Mainly just
                      download them if they want to… similar to notebook where you don't have to
                      edit cards. That's not what I want users to do in my app."*

                      What sat here was `DeckOcclusion`, which opened the drag-your-own-boxes
                      editor. It was added the day before to answer *"can I do image occlusion?"*
                      — and the answer to that question is now DeepSeek making the cards itself,
                      not the learner drawing rectangles. `OcclusionEditor` is not deleted (same
                      as the Anki importer above it); the Library simply stopped offering it.

                      🔴 IT IS REPLACED, NOT JUST REMOVED. Taking authoring away leaves a learner
                      with cards they cannot change and cannot take elsewhere, which is a cage
                      rather than a clean surface. Download is the way out: a deck leaves as a
                      file Anki can import, so nothing here is a one-way door. */}
                  <button
                    aria-label={`Download ${deck.name}`}
                    className={ROW_ACTION}
                    disabled={downloading === deck.id}
                    onClick={() => void takeDeck(deck)}
                    title="Download for Anki"
                    type="button"
                  >
                    <Download size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    aria-label={`Share ${deck.name}`}
                    className={ROW_ACTION}
                    onClick={() => setSharing(deck)}
                    type="button"
                  >
                    <Share2 size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    aria-expanded={openDeck === deck.id}
                    aria-label={openDeck === deck.id ? `Hide the cards in ${deck.name}` : `Show the cards in ${deck.name}`}
                    className={ROW_ACTION}
                    onClick={() => void toggleDeck(deck.id)}
                    type="button"
                  >
                    <ChevronDown className={cn("transition-transform", openDeck === deck.id && "rotate-180")} size={15} strokeWidth={1.8} />
                  </button>
                  </span>
                </div>
                {openDeck === deck.id && (
                  <div className="mb-[8px] ml-[32px] mr-[8px] max-h-[320px] overflow-y-auto border-b border-b-black/[0.05] dark:border-b-white/[0.05]">
                    {(cards[deck.id] ?? []).map((card) => (
                      <div className="border-b border-b-black/[0.05] px-[12px] py-[8px] last:border-b-0 dark:border-b-white/[0.05]" key={card.id}>
                        <p className="text-[14px] text-(--ui-text-primary)">{card.front}</p>
                        <p className="mt-[2px] text-[14px] leading-relaxed text-(--ui-text-secondary)">
                          {card.back}
                        </p>
                      </div>
                    ))}
                    {!cards[deck.id] && <p className="px-[12px] py-[8px] text-[14px] text-(--ui-text-secondary)">Loading…</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {showing("slides") && (
      <section className="pb-[40px]">
        <h2 className={SECTION_TITLE}>Slides</h2>
        {shownSlides.length === 0 ? (
          <p className={ROW_EMPTY}>
            {!loaded
              ? "Loading…"
              : query.trim() !== ""
                ? "No slide decks match that."
                : openFolder !== null
                  ? "No slide decks in this folder."
                  : "No slide decks yet. Ask Nemesis for a PowerPoint in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {/* Two columns here, not three: a slide deck has no count worth a column, and the
                reference's third column is a size we do not hold. */}
            <li className={COLUMN_HEAD}>
              <span aria-hidden className="mr-[12px] w-[20px] shrink-0" />
              <span className="min-w-0 flex-1">Name</span>
              <span className={COL_MODIFIED}>Modified</span>
              <span aria-hidden className={COL_COUNT} />
              <span aria-hidden className={COL_ACTIONS} />
            </li>
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
      <section className="pb-[40px]">
        <h2 className={SECTION_TITLE}>Documents</h2>
        {shownNotes.length === 0 ? (
          <p className={ROW_EMPTY}>
            {!loaded
              ? "Loading…"
              : query.trim() !== ""
                ? "No documents match that."
                : openFolder !== null
                  ? "No documents in this folder."
                  : "No documents yet. Ask Nemesis for a summary or a write-up in any conversation."}
          </p>
        ) : (
          <ul className="flex flex-col">
            <li className={COLUMN_HEAD}>
              <span aria-hidden className="mr-[12px] w-[20px] shrink-0" />
              <span className="min-w-0 flex-1">Name</span>
              <span className={COL_MODIFIED}>Modified</span>
              <span aria-hidden className={COL_COUNT} />
              <span aria-hidden className={COL_ACTIONS} />
            </li>
            {shownNotes.map((note) => (
              <li className={ROW} key={note.path}>
                {/* 🔴🔴 IT OPENS HERE, NOT AT `/library/classic`. Owner, 2026-08-25: *"i dont want
                    anything to route to this old library."* This was the last link into it, and it
                    was a navigation OFF the Library to read one of the Library's own documents —
                    the surface the owner screenshotted showing "Couldn't reach your notes".

                    🔴 THE SAME CARD THE CANVAS USES, not a second reader. `OutputPreview` takes a
                    `notePath` and fetches the body itself, so a document reads identically wherever
                    it is opened from, and there is one place to fix when it is wrong. */}
                <button
                  className={ROW_MAIN}
                  onClick={() => setReadingNote({ createdAt: "", id: note.id, kind: "note", notePath: note.path, title: note.title })}
                  type="button"
                >
                  <NotebookText className={COL_ICON} size={20} strokeWidth={1.8} />
                  <span className={ROW_NAME}>{note.title}</span>
                  <span className={cn(COL_MODIFIED, ROW_META)}>{when(note.updatedAt)}</span>
                  <span aria-hidden className={COL_COUNT} />
                </button>
                <span className={COL_ACTIONS}>
                  <FolderPicker
                    current={note.folderId}
                    folders={folders}
                    label={`Move ${note.title} to a folder`}
                    onFile={(folderId) => void file("note", note.id, folderId)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {readingNote && <OutputPreview onClose={() => setReadingNote(null)} output={readingNote} />}

      {/* 🔴 NO CARD, NO SHADOW — the reference draws neither anywhere on this page. The hint keeps
          its hairline, at the measured divider colour, so it belongs to the same drawing as the
          rows above it. */}
      <footer className="flex items-start gap-[8px] border-t border-t-black/[0.05] pt-[16px] dark:border-t-white/[0.05]">
        <GraduationCap className="mt-[2px] shrink-0 text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
        <p className="text-[14px] leading-relaxed text-(--ui-text-secondary)">
          Your canvases live in the sidebar. Everything they make for you is kept here, and both
          use the same folders.
        </p>
      </footer>

      {/* 🔴 CONDITIONAL, NEVER `open={…}`. Mounting DeckReview starts a load of every deck,
          card and review on the account; keeping it unmounted until a learner presses a deck
          is what stops the Library paying that cost on arrival. */}
      {reviewing && <DeckReview deckId={reviewing} onClose={() => setReviewing(null)} />}
      {/* 🔴 The Anki import and Progress dialogs were removed with their buttons (owner,
          2026-08-24), and the occlusion EDITOR went the same way the day after (owner,
          2026-08-25: "I don't want users to edit flashcards, really"). In all three cases the
          component still exists and still works — this page simply no longer offers it. */}
      {sharing && <DeckShare deck={sharing} onClose={() => setSharing(null)} userId={userId} />}
      </main>
    </div>
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
      <DropdownMenuTrigger aria-label={label} className={ROW_ACTION}>
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
    <li className={ROW}>
      <a
        className={cn(ROW_MAIN, !row.canvasId && "pointer-events-none opacity-60")}
        href={row.canvasId ? `/deck?c=${row.canvasId}&o=${encodeURIComponent(row.assetId)}` : "#"}
      >
        <MonitorPlay className={COL_ICON} size={20} strokeWidth={1.8} />
        <span className={ROW_NAME}>{row.title}</span>
        <span className={cn(COL_MODIFIED, ROW_META)}>{when(row.createdAt)}</span>
        <span aria-hidden className={COL_COUNT} />
      </a>
      {/* 🔴 THE DESIGN CHIP IS THE ONE CONTROL THE REFERENCE HAS NO EQUIVALENT OF, and it is a
          label rather than an icon, so it is the only thing that can outgrow the measured 112px
          trailing slot. It is made shrinkable here rather than widened for everyone: its own
          label already truncates, so it gives up width instead of pushing the Modified column
          out of the one place all three shelves agree on. */}
      <span className={cn(COL_ACTIONS, "gap-[4px]")}>
        <FolderPicker current={row.folderId} folders={folders} label={`Move ${row.title} to a folder`} onFile={onFile} />
        <span className="flex min-w-0 shrink [&>button>span]:min-w-0 [&>button]:min-w-0 [&>button]:shrink">
          <DeckDesignPicker designId={designId} onPick={choose} sampleTitle={row.title} />
        </span>
      </span>
    </li>
  );
}
