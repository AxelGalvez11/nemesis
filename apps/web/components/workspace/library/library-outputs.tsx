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

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, GraduationCap, Layers, MonitorPlay, NotebookText, Share2 } from "lucide-react";

import { DeckDesignPicker, useDeckDesignChoice } from "@/components/workspace/deck/deck-design-picker";
import { DeckReview } from "@/components/workspace/study/deck-review";
import { DeckShare } from "./deck-share";
import { loadCanvas } from "@/lib/learn/canvas-store";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface DeckRow {
  id: string;
  name: string;
  createdAt: string;
  cards: number;
}

interface NoteRow {
  path: string;
  title: string;
  updatedAt: string;
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
}

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
  const [fetching, setFetching] = useState<string | null>(null);
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

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [deckRes, noteRes, slidesRes] = await Promise.all([
        supabase
          .from("study_decks")
          .select("id,name,created_at,study_cards(count)")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("readable_library_documents")
          .select("path,title,updated_at")
          .eq("kind", "note")
          .eq("deleted", false)
          .order("updated_at", { ascending: false })
          .limit(200),
        // Slides live as their PLAN on the canvas that made them; the assets ledger is what
        // lets this page list them without loading every canvas. Download loads the one
        // canvas and rebuilds the file from the stored plan.
        supabase
          .from("assets")
          .select("id,title,created_at,canvas_outputs(canvas_id)")
          .eq("kind", "generated_slides")
          .eq("deleted", false)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (!alive) return;
      if (!deckRes.error && deckRes.data) {
        setDecks(
          (deckRes.data as { id: string; name: string; created_at: string; study_cards: { count: number }[] }[]).map(
            (row) => ({
              cards: row.study_cards?.[0]?.count ?? 0,
              createdAt: row.created_at,
              id: row.id,
              name: row.name,
            }),
          ),
        );
      }
      if (!noteRes.error && noteRes.data) {
        setNotes(
          (noteRes.data as { path: string; title: string; updated_at: string }[]).map((row) => ({
            path: row.path,
            title: row.title,
            updatedAt: row.updated_at,
          })),
        );
      }
      if (!slidesRes.error && slidesRes.data) {
        setSlides(
          (slidesRes.data as { id: string; title: string; created_at: string; canvas_outputs: { canvas_id: string }[] }[]).map(
            (row) => ({
              assetId: row.id,
              canvasId: row.canvas_outputs?.[0]?.canvas_id ?? null,
              createdAt: row.created_at,
              title: row.title,
            }),
          ),
        );
      }
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
        <h1 className="text-xl font-semibold text-(--ui-text-primary)">Library</h1>
        <p className="mt-1 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          What Nemesis has made for you: decks to review, notes to keep.
        </p>
        {/* 🔴🔴 BOTH DOORS REMOVED — owner, 2026-08-24: "the library page has an import from Anki
            button that I don't want. The library also has a progress button that I did not ask for.
            I mainly just want buttons for slides, flash cards, and documents." They arrived here
            when the old Study tab was retired and its surviving features had to live somewhere;
            "somewhere" was read as "the top of the Library", which is the one page a learner opens
            to reach their own work. The shelves below ARE the page. */}
      </header>

      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Flashcard decks</h2>
        {decks.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {loaded
              ? "No decks yet. On a canvas, open Sources and outputs, then the outputs tab, and press Make flashcards."
              : "Loading…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {decks.map((deck) => (
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

      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Slides</h2>
        {slides.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {loaded
              ? "No slide decks yet. On a canvas, ask for a PowerPoint, or press Make slides in the outputs panel."
              : "Loading…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {slides.map((row) => (
              <SlidesShelfRow
                busy={fetching === row.assetId}
                key={row.assetId}
                onDownload={(designId) =>
                  void (async () => {
                    if (!row.canvasId) return;
                    setFetching(row.assetId);
                    try {
                      const canvas = await loadCanvas(userId, row.canvasId);
                      const output = canvas?.outputs?.find((entry) => entry.assetId === row.assetId && entry.deck);
                      if (!output?.deck) return;
                      const { downloadDeck } = await import("@/lib/export/deck-download");
                      await downloadDeck(output.deck, output.title, designId);
                    } finally {
                      setFetching(null);
                    }
                  })()
                }
                row={row}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="pb-10">
        <h2 className={SECTION_TITLE}>Notes</h2>
        {notes.length === 0 ? (
          <p className="px-1 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
            {loaded
              ? "No notes yet. On a canvas, open Sources and outputs, then the outputs tab, and press Make a summary note."
              : "Loading…"}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {notes.map((note) => (
              <li key={note.path}>
                {/* The library's own reader, deep-linked — the same route the canvas panel and
                    /slides already use. */}
                <a className={cn(ROW, "no-underline")} href={`/library/classic?note=${encodeURIComponent(note.path)}`}>
                  <NotebookText className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
                    {note.title}
                  </span>
                  <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                    {when(note.updatedAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex items-start gap-2 rounded-xl border border-(--ui-stroke-tertiary) px-4 py-3">
        <GraduationCap className="mt-0.5 shrink-0 text-(--ui-text-tertiary)" size={15} strokeWidth={1.8} />
        <p className="text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
          Your canvases now live in the sidebar, with folders. Everything a canvas makes for you is
          kept here.
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
    </main>
  );
}

function SlidesShelfRow({
  row,
  busy,
  onDownload,
}: {
  row: SlidesRow;
  busy: boolean;
  onDownload: (designId: string) => void;
}) {
  const { choose, designId } = useDeckDesignChoice(row.assetId);
  return (
    <li className="flex items-center gap-1">
      <button
        className={cn(ROW, "min-w-0 flex-1 disabled:opacity-60")}
        disabled={busy || !row.canvasId}
        onClick={() => onDownload(designId)}
        type="button"
      >
        <MonitorPlay className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
          {row.title}
        </span>
        <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          {busy ? "Building…" : `.pptx · ${when(row.createdAt)}`}
        </span>
      </button>
      <DeckDesignPicker designId={designId} onPick={choose} sampleTitle={row.title} />
    </li>
  );
}
