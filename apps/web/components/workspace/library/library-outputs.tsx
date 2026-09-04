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
//
// 🔴🔴 2026-09-04: THE PAGE WEARS THE SHARED FRAME (`shell/page-frame.tsx`), NOT CHATGPT'S
// LIST. The owner's sequence that day: the shelf pages "looked too much like ChatGPT"; then,
// pointing at gemini.google.com/library, "maybe something similar to this"; then "remove
// projects from library, make sure spacing is consistent across projects, library, and apps
// pages". So: three sections (Flashcards, Slides, Documents), each showing its newest three with
// a round View all; soft 89px rows; no folder rows, no New folder, no grid/list toggle. Every
// number is the frame's, measured off Gemini and documented there. What a row DOES is unchanged:
// a deck reviews, a document reads, a slide deck opens its page, and the ⋯ still files.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Layers, MonitorPlay, MoreHorizontal, NotebookText, Search } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  FRAME_BUTTON_FILL,
  FRAME_HEAD_GAP_PX,
  FRAME_LIST_GAP_PX,
  FRAME_ROW_GAP_PX,
  FRAME_ROW_H_PX,
  PageFrame,
  PageTitle,
  RoundButton,
  RowIcon,
  RowText,
  SOFT_ROW,
  Section,
} from "@/components/workspace/shell/page-frame";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { usePrompt } from "@/components/desktop-ui/prompt-dialog";
import { DeckReview } from "@/components/workspace/study/deck-review";
import { DeckShare } from "./deck-share";
import { deckFileName, deckToAnkiText } from "@/lib/workspace/deck-export";
import { listFolders, type Folder } from "@/lib/learn/canvas-store";
import { applyRevision, reviseOutputMarkdown, undoRevision, type ReviseAsk } from "@/lib/learn/revise-output";
import { deleteOutput, fileOutput, isSoftDeleted, renameOutput, type OutputKind } from "@/lib/workspace/library-filing";
import { readLibraryNote } from "@/lib/workspace/library-note-read";
import { replaceLibraryNoteBody } from "@/lib/workspace/library-write";
import { OutputPreview } from "@/components/workspace/learn/output-preview";
import { CHROME } from "@/components/workspace/learn/reader-chrome";
import { putPending } from "@/components/workspace/learn/pending-attachment";
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
  /** 🔴 Who wrote it. Only a `nemesis` note is offered the revise door — see the reader mount. */
  madeBy: "learner" | "nemesis";
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

/** The three sections, in the order the owner named them (2026-08-24). "all" is the overview. */
const SECTION_ORDER: readonly OutputKind[] = ["deck", "slides", "note"];
const SECTION_LABEL: Record<OutputKind, string> = { deck: "Flashcards", note: "Documents", slides: "Slides" };

/** Empty-state and loading copy, in a row's own padding so it sits where a row would. */
const ROW_EMPTY = "px-[20px] py-[12px] text-[14px] text-(--ui-text-secondary)";
/** How many rows a section shows on the overview before "View all". Reference: 3. */
const PEEK = 3;

function when(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

export interface LibraryPreview {
  readonly decks: readonly DeckRow[];
  readonly notes: readonly NoteRow[];
  readonly slides: readonly SlidesRow[];
  readonly folders: readonly Folder[];
}

export function LibraryOutputs({ preview, userId }: { preview?: LibraryPreview; userId: string | null }) {
  const [decks, setDecks] = useState<DeckRow[]>(() => [...(preview?.decks ?? [])]);
  const [notes, setNotes] = useState<NoteRow[]>(() => [...(preview?.notes ?? [])]);
  /**
   * What is open on screen, as the shape the shared card takes.
   *
   * 🔴 IT CARRIES A CANVAS ID NOW, because a slide deck opens here too and its full-page view is
   * addressed by canvas. A document has none and does not need one.
   */
  const [reading, setReading] = useState<{ canvasId?: string; output: CanvasOutput } | null>(null);
  const [loaded, setLoaded] = useState(preview !== undefined);
  const [slides, setSlides] = useState<SlidesRow[]>(() => [...(preview?.slides ?? [])]);
  // 🔴🔴 THE PEEK IS GONE, AND WITH IT THE ONLY OTHER THING A DECK ROW COULD DO. Owner,
  // 2026-09-01: *"the option to show the flashcard I don't think that's really necessary in the
  // library."* It unrolled the answers under the row — added on 2026-08-24 as the consolation for
  // making the row REVIEW the deck instead of listing it. Now that pressing a deck opens it full
  // screen, where the cards are the whole screen, a second way to read them is a door onto the
  // room you are already standing in.
  //
  // Which deck is being REVIEWED. Null means nothing is mounted and nothing has been fetched —
  // mounting DeckReview is what triggers the whole-account study load, see its header.
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
  /** Whether the round magnifier has opened into a field. Closes again when emptied and left. */
  const [searching, setSearching] = useState(false);
  const [folders, setFolders] = useState<Folder[]>(() => [...(preview?.folders ?? [])]);
  const router = useRouter();
  const ask = usePrompt();
  const confirm = useConfirm();

  /**
   * Rename and delete, on every row (owner 2026-09-04, #1155: "make sure the library has
   * rename and delete", after a comparison found the reference's row menu is Download, separator,
   * Rename, Delete and ours had neither of the last two).
   *
   * 🔴 NOTHING ON SCREEN CHANGES UNTIL THE DATABASE AGREES — the same rule `file` follows. A row
   * renamed or removed optimistically and then refused by the write would show the learner a
   * Library the server does not hold.
   *
   * 🔴 WHICH KINDS CAN BE UNDONE IS READ FROM THE SCHEMA (`isSoftDeleted`), never typed per
   * caller: a deck delete is hard and its cards cascade, a note or a slide deck is a soft delete.
   * The callers pass only what happens to the thing; this adds the permanence sentence.
   */
  const renameRow = useCallback(
    async (kind: OutputKind, id: string, currentName: string, noun: string) => {
      const next = await ask({
        confirmLabel: "Rename",
        initial: currentName,
        placeholder: "Name",
        title: `Rename ${noun}`,
      });
      if (next === null || !next.trim() || next.trim() === currentName) return;
      const name = next.trim();
      if (!(await renameOutput(kind, id, name))) return;
      if (kind === "deck") setDecks((was) => was.map((row) => (row.id === id ? { ...row, name } : row)));
      if (kind === "note") setNotes((was) => was.map((row) => (row.id === id ? { ...row, title: name } : row)));
      if (kind === "slides") setSlides((was) => was.map((row) => (row.assetId === id ? { ...row, title: name } : row)));
    },
    [ask],
  );
  const removeRow = useCallback(
    async (kind: OutputKind, id: string, name: string, detail: string) => {
      const body = isSoftDeleted(kind) ? detail : `${detail} This can't be undone.`;
      const yes = await confirm({ body, confirmLabel: "Delete", title: `Delete "${name}"?` });
      if (!yes) return;
      if (!(await deleteOutput(kind, id))) return;
      if (kind === "deck") setDecks((was) => was.filter((row) => row.id !== id));
      if (kind === "note") setNotes((was) => was.filter((row) => row.id !== id));
      if (kind === "slides") setSlides((was) => was.filter((row) => row.assetId !== id));
    },
    [confirm],
  );

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
          .select("id,path,title,updated_at,folder_id,made_by")
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
          (noteRes.data as { id: string; path: string; title: string; updated_at: string; folder_id: string | null; made_by: string | null }[]).map((row) => ({
            folderId: row.folder_id,
            id: row.id,
            // 🔴 ANYTHING BUT THE EXACT WORD READS AS THE LEARNER'S. A null (a row written before
            // the column existed) must not open a door onto somebody's own writing.
            madeBy: row.made_by === "nemesis" ? ("nemesis" as const) : ("learner" as const),
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
   * Nemesis revising a note it wrote, asked for from a pin on the page.
   *
   * 🔴🔴 THE CANVAS COULD NOT LEND THIS. Its `reviseOutput` ends at `session.updateOutput(...)`,
   * which moves a canvas's in-memory row and never touches `readable_library_documents`. On the
   * shelf there is no session and the note IS the database row, so the write has to be real:
   * ask the model, save the row, then show the new words. Same model call either way
   * (`reviseOutputMarkdown`), different landing place.
   *
   * 🔴 THE DOCUMENT IS FETCHED AGAIN AT THE MOMENT OF THE ASK, never revised from the copy the
   * reader happens to be showing. A note opened, left on screen, and edited elsewhere would
   * otherwise be rewritten from a stale body and the other edit would vanish inside the revision.
   *
   * 🔴 NOTHING IS SHOWN UNTIL THE ROW IS WRITTEN. The reverse order — paint it, then save — is how
   * a learner ends up reading a revision that only ever existed on their screen.
   *
   * Returns an error sentence, or null when the note was rewritten.
   */
  const reviseNote = useCallback(
    async (output: CanvasOutput, ask: ReviseAsk): Promise<string | null> => {
      if (!userId) return "Sign in to ask for changes.";
      if (!output.notePath) return "This note can't be revised yet.";
      const current = await readLibraryNote(output.notePath);
      if (current === null) return "That note couldn't be read, so nothing was changed.";
      const result = await reviseOutputMarkdown(userId, { markdown: current, title: output.title }, ask);
      if ("error" in result) return result.error;
      const failed = await replaceLibraryNoteBody({ content: result.markdown, id: output.id, userId });
      if (failed) return failed;
      // `applyRevision` pushes the OUTGOING body onto `revisions`, which is what Undo pops. It
      // lives on the open object only: the row keeps the current text, and closing the reader
      // ends the undo history — a stack that outlived the screen it belongs to would be a
      // surprise waiting weeks to happen.
      setReading((was) =>
        was && was.output.id === output.id
          ? { ...was, output: applyRevision({ ...was.output, markdown: current }, { markdown: result.markdown }) }
          : was,
      );
      setNotes((was) => was.map((row) => (row.id === output.id ? { ...row, updatedAt: new Date().toISOString() } : row)));
      return null;
    },
    [userId],
  );

  /** Put back what Nemesis replaced. 🔴 THE ROW IS WRITTEN TOO — an Undo that only repaints the
   *  screen leaves the Library holding the version the learner just rejected. */
  const undoNote = useCallback(
    (output: CanvasOutput) => {
      const back = undoRevision(output);
      if (back.markdown === output.markdown || !userId) return;
      setReading((was) => (was && was.output.id === output.id ? { ...was, output: back } : was));
      void replaceLibraryNoteBody({ content: back.markdown ?? "", id: output.id, userId });
    },
    [userId],
  );

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


  // 🔴 ONE PREDICATE, APPLIED TO ALL THREE SHELVES. Writing the folder test into each list is how
  // the three quietly come to disagree about what "unfiled" means.

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

  const shownDecks = useMemo(() => decks.filter((row) => matches(row.name)), [decks, matches]);
  const shownNotes = useMemo(() => notes.filter((row) => matches(row.title)), [notes, matches]);
  const shownSlides = useMemo(() => slides.filter((row) => matches(row.title)), [slides, matches]);

  /** How many outputs of any kind sit in each folder — a folder chip that never says 0 is a lie. */
  /**
   * Ask a question about the document on screen, in a new canvas.
   *
   * 🔴🔴 Owner, 2026-09-01, of ChatGPT's library: *"it also has like this chat bar at the bottom so
   * that you can ask a question about it, and then when you send it, it'll take you to a new chat.
   * So I think that'll be a good thing to have only for the library."*
   *
   * 🔴 THE DOCUMENT TRAVELS WITH THE QUESTION, OR THE QUESTION IS UNANSWERABLE. "What does this
   * mean?" is nothing on its own. `putPending` is the same hand-off the front door uses for a
   * dropped file — a module variable, single-use, cleared as it is read — and the canvas that is
   * about to mount picks it up as its own material. So the new conversation opens already holding
   * the thing the learner was reading.
   *
   * 🔴 A REAL `File`, BUILT FROM TEXT WE ALREADY HAVE. The reader hands back the body it is showing
   * because it is the only thing that has it: a note's markdown arrives there by fetch and a deck's
   * is a plan rather than text anywhere on disk. Making a `File` from that string means the canvas
   * ingests it through the ONE path every other attachment takes, rather than growing a second
   * lane for material that came from inside the app.
   *
   * 🔴 `read: null` BECAUSE NOTHING HAS STARTED READING IT. The front door hands over an in-flight
   * `extractFile` promise; there is no such read here, and claiming one would leave the canvas
   * awaiting a promise nobody made.
   */
  const askAbout = useCallback(
    (question: string, material: { name: string; text: string } | null) => {
      if (material) {
        putPending([{ file: new File([material.text], material.name, { type: "text/markdown" }), read: null }]);
      }
      router.push(`/learn?ask=${encodeURIComponent(question)}`);
    },
    [router],
  );

  /**
   * Hand a whole deck to the learner as a file.
   *
   * 🔴 IT READS THE DECK'S OWN CARDS, UNCAPPED. The peek this used to sit beside capped its read
   * at 200 rows because it was filling a list nobody scrolls to the end of; downloading 200 of a
   * 400-card deck and calling it the deck would be a silent, unrecoverable loss the learner only
   * discovers inside Anki. The peek is gone; the rule it taught is not.
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


  // 🔴 ONE RENDERER PER ROW SHAPE, shared verbatim between a kind's own section on the
  // overview and its View-all page — the menus and downloads on a deck row are the SAME element
  // in both places, so they cannot drift apart (owner 2026-08-30, the recency rework).
  //
  // 🔴🔴 THE ROW IS A DIV HOLDING A BUTTON AND A MENU, NOT A BUTTON HOLDING A MENU. A menu
  // trigger inside a button is a button inside a button, which the browser refuses to draw and
  // React warns about on every render. The main press covers the whole row (`inset-0`); the ⋯
  // floats above it at the right padding and is the only thing on the row that is not the press.
  const rowShell = (key: string, children: ReactNode, menu: ReactNode) => (
    <div className={cn("group/row", SOFT_ROW)} key={key} style={{ minHeight: FRAME_ROW_H_PX }}>
      {children}
      <span className="absolute top-1/2 right-[20px] -translate-y-1/2">{menu}</span>
    </div>
  );
  /** What a row says under its title: the one count we hold, the project it lives in, the date. */
  const projectOf = (folderId: string | null): string | null => folders.find((folder) => folder.id === folderId)?.name ?? null;
  const metaLine = (parts: (string | null)[]) => parts.filter((part): part is string => Boolean(part)).join(" · ");
  const deckRow = (deck: DeckRow) =>
    rowShell(
      deck.id,
      <button
        aria-label={`Review ${deck.name}`}
        className="absolute inset-0 flex items-start gap-[16px] rounded-[28px] p-[20px] pr-[72px] text-left"
        onClick={() => setReviewing(deck.id)}
        type="button"
      >
        <RowIcon><Layers size={22} strokeWidth={1.7} /></RowIcon>
        <RowText meta={metaLine([`${deck.cards} card${deck.cards === 1 ? "" : "s"}`, projectOf(deck.folderId), when(deck.createdAt)])} title={deck.name} />
      </button>,
      // 🔴🔴 A HAND-AUTHORING DOOR STOOD HERE FOR ONE DAY, AND THE OWNER REVERSED IT
      // (2026-08-25): *"I don't want users to edit flashcards, really. Mainly just download them
      // if they want to… similar to notebook where you don't have to edit cards."* Download is
      // the way out: a deck leaves as a file Anki can import, so nothing here is a one-way door.
      <RowMenu
        current={deck.folderId}
        folders={folders}
        label={`Options for ${deck.name}`}
        onDelete={() => void removeRow("deck", deck.id, deck.name, `Its ${deck.cards} ${deck.cards === 1 ? "card goes" : "cards go"} with it.`)}
        onFile={(folderId) => void file("deck", deck.id, folderId)}
        onRename={() => void renameRow("deck", deck.id, deck.name, "deck")}
      >
        <DropdownMenuItem disabled={downloading === deck.id} onClick={() => void takeDeck(deck)}>
          Download for Anki
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSharing(deck)}>Share</DropdownMenuItem>
      </RowMenu>,
    );
  const noteRow = (note: NoteRow) =>
    rowShell(
      note.path,
      // 🔴🔴 IT OPENS HERE, NOT AT `/library/classic`. Owner, 2026-08-25: *"i dont want anything
      // to route to this old library."* `OutputPreview` is the same card the canvas uses, so a
      // document reads identically wherever it is opened from.
      <button
        className="absolute inset-0 flex items-start gap-[16px] rounded-[28px] p-[20px] pr-[72px] text-left"
        onClick={() => setReading({ output: { createdAt: "", id: note.id, kind: "note", notePath: note.path, title: note.title } })}
        type="button"
      >
        <RowIcon><NotebookText size={22} strokeWidth={1.7} /></RowIcon>
        <RowText meta={metaLine([note.madeBy === "learner" ? "Your notes" : "Written by Nemesis", projectOf(note.folderId), when(note.updatedAt)])} title={note.title} />
      </button>,
      <RowMenu
        current={note.folderId}
        folders={folders}
        label={`Options for ${note.title}`}
        onDelete={() => void removeRow("note", note.id, note.title, "It leaves your Library.")}
        onFile={(folderId) => void file("note", note.id, folderId)}
        onRename={() => void renameRow("note", note.id, note.title, "document")}
      />,
    );
  const slidesRow = (row: SlidesRow) =>
    rowShell(
      row.assetId,
      // 🔴 A SLIDE DECK STILL OPENS AS ITS OWN PAGE, AND THE OWNER SAID SO: *"the slides … open
      // like a new page pretty much … And the library is fine."* `/deck` composes the real slides
      // and carries the design picker and the .pptx export; an in-panel view would be an outline.
      <a
        className={cn("absolute inset-0 flex items-start gap-[16px] rounded-[28px] p-[20px] pr-[72px] text-left", !row.canvasId && "pointer-events-none opacity-60")}
        href={row.canvasId ? `/deck?c=${row.canvasId}&o=${encodeURIComponent(row.assetId)}` : "#"}
      >
        <RowIcon><MonitorPlay size={22} strokeWidth={1.7} /></RowIcon>
        <RowText meta={metaLine(["Slide deck", projectOf(row.folderId), when(row.createdAt)])} title={row.title} />
      </a>,
      <RowMenu
        current={row.folderId}
        folders={folders}
        label={`Options for ${row.title}`}
        onDelete={() => void removeRow("slides", row.assetId, row.title, "It leaves your Library.")}
        onFile={(folderId) => void file("slides", row.assetId, folderId)}
        onRename={() => void renameRow("slides", row.assetId, row.title, "slide deck")}
      />,
    );

  /** Every row of one kind, newest first — the query already applied. */
  const rowsOf = (kind: OutputKind): ReactNode[] =>
    kind === "deck" ? shownDecks.map(deckRow) : kind === "slides" ? shownSlides.map(slidesRow) : shownNotes.map(noteRow);
  const nothing = (kind: OutputKind): string =>
    !loaded
      ? "Loading…"
      : query.trim() !== ""
        ? `No ${SECTION_LABEL[kind].toLowerCase()} match that.`
        : kind === "deck"
          ? "No flashcards yet. Ask Nemesis for some in any conversation."
          : kind === "slides"
            ? "No slides yet. Ask Nemesis for a slide deck in any conversation."
            : "No documents yet. Ask Nemesis for a write-up in any conversation.";

  // 🔴 THE SEARCH IS A ROUND BUTTON THAT OPENS INTO A FIELD. The reference's page has no search
  // at all; a library of a hundred things needs one, so it lives inside the same round-button
  // grammar as everything else on the frame and only takes up a row's width while it is in use.
  const searchControl = searching ? (
    <label className="relative flex h-[40px] w-[240px] items-center">
      <Search aria-hidden className="pointer-events-none absolute left-[14px] text-(--ui-text-secondary)" size={16} strokeWidth={1.8} />
      <input
        aria-label="Search the library"
        autoFocus
        className={cn("h-full w-full rounded-full pr-[14px] pl-[40px] text-[14px] text-(--ui-text-primary) placeholder:text-(--ui-text-tertiary) focus:outline-none", FRAME_BUTTON_FILL)}
        onBlur={() => { if (query === "") setSearching(false); }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search library"
        type="text"
        value={query}
      />
    </label>
  ) : (
    <RoundButton label="Search library" onClick={() => setSearching(true)}>
      <Search size={18} strokeWidth={1.8} />
    </RoundButton>
  );

  return (
    <PageFrame>
      {/* 🔴🔴 THE THREE KINDS ARE SECTIONS NOW, NOT FILTER PILLS. The reference the owner pointed
          at (gemini.google.com/library, 2026-09-04) stacks its kinds as shelves, each showing its
          newest few with a round "View all" on the right, and `shelf` is exactly that: "all" is
          the overview, a kind is that kind's own page under a back arrow. The 2026-08-24 filter
          is the same state, drawn the new way.
          🔴🔴 NO PROJECTS ON THIS PAGE — owner, 2026-09-04: "remove projects from library". The
          folder rows, the open-folder breadcrumb and the New folder button are gone with them; a
          row still SAYS which project it is in, and the ⋯ still moves it, because filing is the
          one thing only this page can do to an output. Projects are made and browsed on /projects.
          🔴 NO SUBTITLE — owner, 2026-08-24: *"remove the description under the library heading."* */}
      {shelf === "all" ? (
        <>
          <PageTitle controls={searchControl}>Library</PageTitle>
          {SECTION_ORDER.map((kind) => {
            const rows = rowsOf(kind);
            // 🔴 A SEARCH THAT MATCHES NOTHING IN A SECTION HIDES THE SECTION, so three headings
            // over "No slides match that" do not stand between the learner and the one row that
            // did match. With no search, an empty section stays, and says what would fill it.
            if (rows.length === 0 && query.trim() !== "") return null;
            return (
              <Section
                controls={
                  <RoundButton label={`View all ${SECTION_LABEL[kind].toLowerCase()}`} onClick={() => setShelf(kind)}>
                    <ChevronRight size={20} strokeWidth={1.8} />
                  </RoundButton>
                }
                key={kind}
                title={SECTION_LABEL[kind]}
              >
                <div className="flex flex-col" style={{ gap: FRAME_ROW_GAP_PX }}>
                  {rows.length === 0 ? <p className={ROW_EMPTY}>{nothing(kind)}</p> : query.trim() !== "" ? rows : rows.slice(0, PEEK)}
                </div>
              </Section>
            );
          })}
        </>
      ) : (
        <>
          <PageTitle
            before={
              <RoundButton label="Back to the Library" onClick={() => setShelf("all")}>
                <ArrowLeft size={20} strokeWidth={1.8} />
              </RoundButton>
            }
            controls={searchControl}
          >
            {SECTION_LABEL[shelf]}
          </PageTitle>
          <div className="flex flex-col" style={{ gap: FRAME_LIST_GAP_PX, marginTop: FRAME_HEAD_GAP_PX }}>
            {rowsOf(shelf).length === 0 ? <p className={ROW_EMPTY}>{nothing(shelf)}</p> : rowsOf(shelf)}
          </div>
        </>
      )}

      {reading && (
        <OutputPreview
          comments={{ preview: Boolean(preview), uid: userId }}
          initialMode="full"
          canvasId={reading.canvasId}
          onAsk={askAbout}
          onClose={() => setReading(null)}
          // 🔴🔴 THE SECOND HALF OF THE OWNER'S SENTENCE: *"a comment or edit (IF ITS NEMESIS
          // MADE)"*. `onRevise` is passed only for a note this app wrote, so a document the
          // learner typed keeps the pin and "Add comment" and is never offered a rewrite. The
          // reader treats an absent `onRevise` as "no send button", so the door is closed by
          // NOT EXISTING rather than by a disabled control.
          //
          // 🔴 THE ORIGIN IS LOOKED UP FRESH FROM THE LIST rather than copied onto the opened
          // object, so a refresh that re-reads `made_by` is what decides, not a stale snapshot.
          onRevise={notes.find((row) => row.id === reading.output.id)?.madeBy === "nemesis" ? reviseNote : undefined}
          onUndo={undoNote}
          output={reading.output}
        />
      )}

      {/* 🔴 CONDITIONAL, NEVER `open={…}`. Mounting DeckReview starts a load of every deck,
          card and review on the account; keeping it unmounted until a learner presses a deck
          is what stops the Library paying that cost on arrival.

          🔴🔴 FULL SCREEN FROM HERE, AND THE 2026-08-31 RULING THAT SAID OTHERWISE WAS ABOUT A
          DIFFERENT DOOR. That day the owner reported a deck opening full screen when he wanted
          the panel — *"the flashcard open full screen, and it did not open in the sidebar, like
          the test"* — and this mount was changed to docked to match. Today, of the Library
          specifically: *"when I click on the flashcards it just pulls up a sidebar, which is not
          how it's supposed to be in the library — for the library it should just be full screen
          immediately."*

          Both hold once the rule is scoped to the DOOR rather than the object. Docking exists to
          keep something else on screen, and inside a canvas that something is the conversation the
          deck came out of. Here it is a list of file names, and squeezing that beside a card you
          are trying to answer helps nobody. Full screen is still one button from docked either
          way; this only decides where you land. See study-panel.tsx. */}
      {/* 🔴🔴 THE SAME HEADER AND THE SAME BAR AS THE DOCUMENT BESIDE IT (owner, 2026-09-03: *"it
          doesn't have the same toolbar… it should be the same, basically the one it has for the
          document"*). Three things were different and all three are supplied from here: the crumb
          said "Flashcards" where a document opened from this shelf says "Library"; the header
          carried no Download, though the row's ⋯ has offered one all along; and there was no ask
          bar at all. Download is passed IN rather than rebuilt inside the panel, so `takeDeck`
          stays the one place that turns a deck into a file. */}
      {reviewing && (
        <DeckReview
          actions={
            <button
              aria-label="Download for Anki"
              className={cn(CHROME.button, "disabled:opacity-40")}
              disabled={downloading === reviewing}
              onClick={() => {
                const row = decks.find((deck) => deck.id === reviewing);
                if (row) void takeDeck(row);
              }}
              title="Download for Anki"
              type="button"
            >
              <Codicon name="download" size={CHROME.icon} />
            </button>
          }
          crumb="Library"
          deckId={reviewing}
          initialMode="full"
          onAsk={askAbout}
          onClose={() => setReviewing(null)}
        />
      )}
      {/* 🔴 The Anki import and Progress dialogs were removed with their buttons (owner,
          2026-08-24), and the occlusion EDITOR went the same way the day after (owner,
          2026-08-25: "I don't want users to edit flashcards, really"). In all three cases the
          component still exists and still works — this page simply no longer offers it. */}
      {sharing && <DeckShare deck={sharing} onClose={() => setSharing(null)} userId={userId} />}
    </PageFrame>
  );
}

/**
 * The row's ⋯ — everything a row can do that is not "open me".
 *
 * 🔴 ONE MENU, NOT A ROW OF BUTTONS. Owner, 2026-09-01, over a screenshot with the whole trailing
 * column ringed: *"the documents in library have these options that i dont want."* Every action
 * a row has lives one press deeper, in here; nothing prints at rest. Each kind passes the items
 * only it has (a deck: download, share) and the filing submenu is written once, because it is the
 * one action all three kinds share and three copies of it would disagree about what "No project"
 * means.
 *
 * 🔴🔴 IT IS INVISIBLE UNTIL THE ROW IS HOVERED, and that is the same ruling. The reference's
 * rows carry no control at all; ours carries the 40px round button the frame uses everywhere,
 * held at opacity 0 until the pointer is on the row, the control has focus, or its own menu is
 * open. `transition-[background-color,color,opacity]`, NOT `transition-colors` plus an opacity
 * one: two utilities both set `transition-property` and only one wins.
 *
 * 🔴 IT FILES, IT DOES NOT CREATE. Projects are made on /projects (owner 2026-09-04: "remove
 * projects from library"); this only files into ones that exist, and says so plainly when there
 * are none rather than opening an empty submenu that looks broken.
 */
function RowMenu({
  children,
  current,
  folders,
  label,
  onDelete,
  onFile,
  onRename,
}: {
  /** Items this kind of row has and the others do not. Rendered above the filing submenu. */
  children?: ReactNode;
  current: string | null;
  folders: readonly Folder[];
  label: string;
  onDelete: () => void;
  onFile: (folderId: string | null) => void;
  onRename: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "flex size-[40px] items-center justify-center rounded-full text-(--ui-text-primary) opacity-0 transition-[background-color,color,opacity] group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
          FRAME_BUTTON_FILL,
        )}
      >
        <MoreHorizontal size={18} strokeWidth={1.8} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {children}
        {children ? <DropdownMenuSeparator /> : null}
        <DropdownMenuSub>
          {/* 🔴 "PROJECT", NOT "FOLDER", ON THIS PAGE NOW. While the Library drew folder rows and
              had a New folder button, this said "Add to folder" so one object had one word on one
              page. With projects gone from the Library (owner 2026-09-04) the only other place the
              learner meets these rows is /projects, and the seam `sidebar-canvases.tsx` records
              is that what a learner READS follows the surface they are on. */}
          <DropdownMenuSubTrigger>Move to project</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {folders.length === 0 ? (
              <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem disabled={current === null} onClick={() => onFile(null)}>
                  No project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map((folder) => (
                  <DropdownMenuItem disabled={current === folder.id} key={folder.id} onClick={() => onFile(folder.id)}>
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* Rename, then Delete: the reference's order, destructive at the bottom, furthest from
            the pointer's resting place. Every row kind has both, so neither is optional here. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        <DropdownMenuItem className="text-(--ui-danger) focus:text-(--ui-danger)" data-testid="library-row-delete" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
