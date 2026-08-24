"use client";

// Library — the home of what Nemesis has made for the learner.
//
// Owner 2026-08-25: "the library will be where Nemesis will output any reports or notes and
// presentations and flashcards", with the canvases themselves moving to the sidebar the same
// day (sidebar-canvases.tsx). So the page's primary objects change for the second time:
// files → canvases (§L, 2026-08-13) → OUTPUTS (this). The canvas manager it replaces is not
// deleted — /dev-preview/library still renders it — but no shipped route mounts it now.
//
// 🔴 EVERY ROW OPENS THE REAL THING. A deck expands into its actual cards (the same
// study_decks/study_cards rows the grading RPC schedules); a note opens in the library's own
// reader at /library/classic. Nothing here is a picture of an artifact.
//
// 🔴 READS ONLY WHAT EXISTS. Decks come from study_decks, notes from
// readable_library_documents — the two stores canvas-deliverables.ts writes. When slides and
// reports earn a real home they earn a section; a section over an empty table would render
// forever-empty shelves and read as broken (the §38.3 lesson).

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Layers, NotebookText } from "lucide-react";

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

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const [deckRes, noteRes] = await Promise.all([
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

  // Deep link: /library?deck=<id> opens straight onto that deck — the canvas's Outputs tab
  // links here. Read from the location rather than useSearchParams, which would demand a
  // Suspense boundary for one string.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("deck");
    if (id) void toggleDeck(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on arrival.
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="pb-8">
        <h1 className="text-xl font-semibold text-(--ui-text-primary)">Library</h1>
        <p className="mt-1 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          What Nemesis has made for you: decks to review, notes to keep.
        </p>
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
                <button className={cn(ROW)} onClick={() => void toggleDeck(deck.id)} type="button">
                  <Layers className="shrink-0 text-(--ui-text-tertiary)" size={16} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">
                    {deck.name}
                  </span>
                  <span className="shrink-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
                    {deck.cards} card{deck.cards === 1 ? "" : "s"} · {when(deck.createdAt)}
                  </span>
                </button>
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
    </main>
  );
}
