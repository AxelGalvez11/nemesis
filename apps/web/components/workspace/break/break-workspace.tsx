"use client";

// The Chill page (owner 2026-08-04: "a page called 'break' … for a brain
// break", later renamed: "rename the 'break' to 'chill' page" — code keeps
// the break namespace so saved progress survives). Eight daily games, all
// client-side and deterministic per calendar day — zero model spend, zero
// network. The hub is the splash: bright color-block cards, one click in.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BeeGame } from "@/components/workspace/break/bee-game";
import { ConnectionsGame } from "@/components/workspace/break/connections-game";
import { CrosswordGame } from "@/components/workspace/break/crossword-game";
import { GameHelp, helpSeen } from "@/components/workspace/break/game-help";
import { LetterBoxedGame } from "@/components/workspace/break/letterboxed-game";
import { SudokuGame } from "@/components/workspace/break/sudoku-game";
import { TilesGame } from "@/components/workspace/break/tiles-game";
import { readBreakDayState, useBreakDateKey, useBreakPick } from "@/components/workspace/break/use-break-day";
import { WordleGame } from "@/components/workspace/break/wordle-game";
import { Button } from "@/components/ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { BEE_PUZZLES } from "@/lib/workspace/break/bee-puzzles";
import { beeMaxScore, beeRank, beeScore } from "@/lib/workspace/break/bee";
import { CONNECTIONS_PUZZLES } from "@/lib/workspace/break/connections-puzzles";
import { connectionsStatus } from "@/lib/workspace/break/connections";
import { MIDI_PUZZLES } from "@/lib/workspace/break/crossword-midis";
import { MINI_PUZZLES } from "@/lib/workspace/break/crossword-puzzles";
import { buildCrossword, isSolved, type CrosswordEntries } from "@/lib/workspace/break/crossword";
import { dailyIndex, dateKeyLabel, extraKey, extraWalkIndex } from "@/lib/workspace/break/daily";
import { LETTERBOX_PUZZLES } from "@/lib/workspace/break/letterboxed-puzzles";
import { letterBoxSolved } from "@/lib/workspace/break/letterboxed";
import { boardCleared, tileEmpty, type Tile } from "@/lib/workspace/break/tiles";
import { WORDLE_ANSWERS } from "@/lib/workspace/break/wordle-words";
import { wordleStatus } from "@/lib/workspace/break/wordle";
import { cn } from "@/lib/utils";

export type BreakGameId = "wordle" | "bee" | "connections" | "mini" | "crossword" | "sudoku" | "letterboxed" | "tiles";

/** Bright hub colors — saturated blocks like the classic games hub. */
export const BREAK_ACCENTS: Record<BreakGameId, string> = {
  wordle: "#6aaa64",
  bee: "#f7da21",
  connections: "#b4a8ff",
  mini: "#6f9bf0",
  crossword: "#3d6edb",
  sudoku: "#fb9b00",
  letterboxed: "#fc716b",
  tiles: "#48bfad",
};

const GAME_CARDS: { id: BreakGameId; name: string; tagline: string }[] = [
  { id: "wordle", name: "Word Guess", tagline: "Six tries to find the five-letter word." },
  { id: "bee", name: "Honeycomb", tagline: "How many words can 7 letters make?" },
  { id: "connections", name: "Groups", tagline: "Create four groups of four." },
  { id: "mini", name: "Mini", tagline: "A crossword you can finish before class." },
  { id: "crossword", name: "Crossword", tagline: "The Mini's bigger sibling." },
  { id: "sudoku", name: "Sudoku", tagline: "One rule, nine digits, no guessing." },
  { id: "letterboxed", name: "Letter Box", tagline: "Loop the square using all 12 letters." },
  { id: "tiles", name: "Tiles", tagline: "Match layers, keep the chain alive." },
];

/** Every bank-picked puzzle for one calendar day, at puzzle number `n` (0 =
 *  the daily). Pure and content-agnostic of React so both the hub (always
 *  n=0) and an open game (whatever puzzle number it's on) can share one
 *  formula per game — n=0 reproduces the pre-extras selection exactly,
 *  since extraKey(dateKey, 0) is the plain dateKey. */
function puzzlesForDay(dateKey: string, n: number) {
  const puzzleKey = extraKey(dateKey, n);
  return {
    dateKey,
    puzzleKey,
    n,
    wordleAnswer: WORDLE_ANSWERS[extraWalkIndex(dateKey, n, WORDLE_ANSWERS.length)]!,
    bee: BEE_PUZZLES[dailyIndex(puzzleKey, "bee", BEE_PUZZLES.length)]!,
    connections: CONNECTIONS_PUZZLES[dailyIndex(puzzleKey, "connections", CONNECTIONS_PUZZLES.length)]!,
    mini: MINI_PUZZLES[dailyIndex(puzzleKey, "mini", MINI_PUZZLES.length)]!,
    midi: MIDI_PUZZLES[dailyIndex(puzzleKey, "crossword", MIDI_PUZZLES.length)]!,
    letterbox: LETTERBOX_PUZZLES[dailyIndex(puzzleKey, "letterboxed", LETTERBOX_PUZZLES.length)]!,
  };
}

/** Today's daily puzzles (n=0), one lookup shared by the hub + whichever
 *  game is open before it advances past the daily. */
export function useTodaysPuzzles() {
  const dateKey = useBreakDateKey();
  return useMemo(() => puzzlesForDay(dateKey, 0), [dateKey]);
}

function crosswordStatus(game: "mini" | "crossword", puzzle: Parameters<typeof buildCrossword>[0], dateKey: string): string | null {
  const saved = readBreakDayState<{ entries: CrosswordEntries; seconds: number }>(game, dateKey);
  if (!saved || Object.keys(saved.entries).length === 0) return null;
  if (isSolved(buildCrossword(puzzle), saved.entries)) {
    return `Solved in ${Math.floor(saved.seconds / 60)}:${String(saved.seconds % 60).padStart(2, "0")}`;
  }
  return "In progress";
}

/** One-line progress label for a hub card, from persisted day state. */
function cardStatus(game: BreakGameId, puzzles: ReturnType<typeof useTodaysPuzzles>): string | null {
  const { dateKey } = puzzles;
  if (game === "wordle") {
    const saved = readBreakDayState<{ guesses: string[] }>("wordle", dateKey);
    if (!saved?.guesses.length) return null;
    const status = wordleStatus(saved.guesses, puzzles.wordleAnswer);
    if (status === "won") return `Solved in ${saved.guesses.length}/6`;
    return status === "lost" ? "Out of guesses" : `${saved.guesses.length}/6 used`;
  }
  if (game === "bee") {
    const saved = readBreakDayState<{ found: string[] }>("bee", dateKey);
    if (!saved?.found.length) return null;
    const rank = beeRank(beeScore(puzzles.bee, saved.found), beeMaxScore(puzzles.bee));
    return `${rank.label} · ${saved.found.length} word${saved.found.length === 1 ? "" : "s"}`;
  }
  if (game === "connections") {
    const saved = readBreakDayState<{ guesses: string[][] }>("connections", dateKey);
    if (!saved?.guesses.length) return null;
    const status = connectionsStatus(puzzles.connections, saved.guesses);
    if (status === "won") return "Solved";
    return status === "lost" ? "Out of tries" : "In progress";
  }
  if (game === "mini") return crosswordStatus("mini", puzzles.mini, dateKey);
  if (game === "crossword") return crosswordStatus("crossword", puzzles.midi, dateKey);
  if (game === "sudoku") {
    const saved = readBreakDayState<{ entries: Record<string, number>; done?: boolean }>("sudoku", dateKey);
    if (!saved || Object.keys(saved.entries).length === 0) return null;
    return saved.done ? "Solved" : "In progress";
  }
  if (game === "letterboxed") {
    const saved = readBreakDayState<{ words: string[] }>("letterboxed", dateKey);
    if (!saved?.words.length) return null;
    if (letterBoxSolved(puzzles.letterbox, saved.words)) return `Solved in ${saved.words.length}`;
    return "In progress";
  }
  const saved = readBreakDayState<{ tiles: Tile[]; best: number }>("tiles", dateKey);
  if (!saved) return null;
  if (boardCleared(saved.tiles)) return `Cleared · best chain ${saved.best}`;
  // "Started" means a LAYER has gone, not a whole tile: most matches strip
  // one layer off two tiles and empty neither, so a tile-count test left the
  // card looking untouched through a long opening run.
  const started = saved.tiles.some((tile) => tile.some((value) => value === -1));
  return started ? `${saved.tiles.filter((tile) => !tileEmpty(tile)).length} tiles left` : null;
}

/** Tiny original glyphs, dark ink on the bright card blocks. */
function GameGlyph({ game }: { game: BreakGameId }) {
  const ink = "#101112";
  if (game === "wordle") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <rect
              key={`${row}${col}`}
              x={4 + col * 14}
              y={4 + row * 14}
              width={12}
              height={12}
              rx={2}
              fill={row === 2 || (row === 1 && col === 1) ? ink : "rgba(255,255,255,0.85)"}
              stroke={ink}
              strokeWidth={1.6}
            />
          )),
        )}
      </svg>
    );
  }
  if (game === "bee") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        <polygon points="24,7 38.5,15.5 38.5,32.5 24,41 9.5,32.5 9.5,15.5" fill="rgba(255,255,255,0.85)" stroke={ink} strokeWidth={2.4} />
        <polygon points="24,16 31,20 31,28 24,32 17,28 17,20" fill={ink} />
      </svg>
    );
  }
  if (game === "connections") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        {[0, 1, 2, 3].map((row) => (
          <rect key={row} x={6} y={5 + row * 10} width={36} height={8} rx={2.5} fill={ink} opacity={0.25 + row * 0.25} />
        ))}
      </svg>
    );
  }
  if (game === "mini" || game === "crossword") {
    const cells = game === "mini" ? 2 : 3;
    const size = game === "mini" ? 19 : 12.4;
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        <rect x={5} y={5} width={38} height={38} rx={4} fill="rgba(255,255,255,0.85)" stroke={ink} strokeWidth={2.4} />
        {Array.from({ length: cells * cells }, (_, index) => {
          const row = Math.floor(index / cells);
          const col = index % cells;
          const dark = game === "mini" ? index === 2 : index === 0 || index === 8;
          return dark ? <rect key={index} x={5 + col * size} y={5 + row * size} width={size} height={size} fill={ink} /> : null;
        })}
        <line x1={5} y1={24} x2={43} y2={24} stroke={ink} strokeWidth={2} />
        <line x1={24} y1={5} x2={24} y2={43} stroke={ink} strokeWidth={2} />
      </svg>
    );
  }
  if (game === "sudoku") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        <rect x={5} y={5} width={38} height={38} rx={4} fill="rgba(255,255,255,0.85)" stroke={ink} strokeWidth={2.4} />
        <line x1={17.7} y1={5} x2={17.7} y2={43} stroke={ink} strokeWidth={1.4} />
        <line x1={30.3} y1={5} x2={30.3} y2={43} stroke={ink} strokeWidth={1.4} />
        <line x1={5} y1={17.7} x2={43} y2={17.7} stroke={ink} strokeWidth={1.4} />
        <line x1={5} y1={30.3} x2={43} y2={30.3} stroke={ink} strokeWidth={1.4} />
        <text x={11} y={15} fontSize={9} fontWeight={700} fill={ink}>7</text>
        <text x={23} y={28} fontSize={9} fontWeight={700} fill={ink}>3</text>
        <text x={35.5} y={40.5} fontSize={9} fontWeight={700} fill={ink}>9</text>
      </svg>
    );
  }
  if (game === "letterboxed") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" className="size-10">
        <rect x={8} y={8} width={32} height={32} fill="rgba(255,255,255,0.85)" stroke={ink} strokeWidth={2.4} />
        <path d="M16 8 L40 24 L24 40 L8 20" fill="none" stroke={ink} strokeWidth={2} />
        {[[16, 8], [40, 24], [24, 40], [8, 20]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={3} fill={ink} />
        ))}
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-10">
      <rect x={6} y={10} width={26} height={26} rx={6} fill="rgba(255,255,255,0.85)" stroke={ink} strokeWidth={2.4} />
      <rect x={16} y={16} width={26} height={26} rx={6} fill={ink} opacity={0.85} />
      <circle cx={29} cy={29} r={5} fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

export function BreakWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const puzzles = useTodaysPuzzles();

  const rawGame = searchParams.get("game");
  const game = GAME_CARDS.some((card) => card.id === rawGame) ? (rawGame as BreakGameId) : null;

  const [helpOpen, setHelpOpen] = useState(false);
  // Status chips read localStorage — render them only after mount so the
  // server and first client paint agree (hydration safety).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Which puzzle number the open game is on today (0 = the daily), loaded
  // from storage in an effect (see useBreakPick) so a refresh comes back to
  // the same puzzle. Reads/writes nothing while `game` is null (the hub).
  const [pick, setPick] = useBreakPick(game, puzzles.dateKey);
  const activePuzzles = useMemo(() => puzzlesForDay(puzzles.dateKey, pick), [puzzles.dateKey, pick]);
  const advance = useCallback(() => setPick(pick + 1), [pick, setPick]);
  const backToDaily = useCallback(() => setPick(0), [setPick]);

  // First visit to a game shows its rules once; the dialog's checkbox can
  // silence it for good, and the ? button reopens it on demand. Tied to
  // `game` only, not `pick` — switching puzzle number shouldn't re-nag.
  useEffect(() => {
    if (game && !helpSeen(game)) setHelpOpen(true);
  }, [game]);

  const open = (id: BreakGameId | null) => {
    router.push(id ? `${pathname}?game=${id}` : pathname, { scroll: false });
  };

  if (game) {
    const card = GAME_CARDS.find((entry) => entry.id === game)!;
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-(--titlebar-height)">
        {/* Same header shape as every other workspace page (see StudyChrome):
            title upper-left in workspace-page-title, tools right, and the
            .workspace-page-header class so a collapsed global rail inserts
            its own leading inset instead of covering the title. */}
        <header className="workspace-page-header flex min-h-12 shrink-0 items-center gap-3 px-6 py-2.5 max-sm:px-4">
          <h1 className="workspace-page-title flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => open(null)}
              data-testid="break-back"
              className="shrink-0 text-(--ui-text-tertiary) transition-colors hover:text-foreground"
            >
              Chill
            </button>
            <span aria-hidden className="shrink-0 font-normal text-(--ui-text-quaternary)">
              /
            </span>
            <span className="truncate">{card.name}</span>
          </h1>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {pick > 0 ? (
              <button
                type="button"
                onClick={backToDaily}
                data-testid="break-back-to-daily"
                className="whitespace-nowrap underline-offset-2 hover:underline"
              >
                Puzzle {pick + 1} · Back to daily
              </button>
            ) : (
              <span className="whitespace-nowrap max-sm:hidden" data-testid="break-date-label">
                {dateKeyLabel(puzzles.dateKey).split(",")[0]}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="New puzzle"
              data-testid="break-new-puzzle"
              onClick={advance}
            >
              <Codicon name="refresh" size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="How to play"
              data-testid="break-help-open"
              onClick={() => setHelpOpen(true)}
            >
              <Codicon name="question" size={13} />
            </Button>
          </span>
        </header>
        <GameHelp game={game} open={helpOpen} onOpenChange={setHelpOpen} />
        {/* pb-6, not pb-10: Word Guess is the tallest board here and the
            header now takes its own row, so every spare pixel is what keeps
            the on-screen keyboard above the fold on a laptop. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-1">
          {/* Keying each game on `pick` remounts it fresh on every puzzle
              switch — the clean way to reset a game's local UI state (typed
              letters, animation nonces, cursor position, …) without a
              bespoke reset effect per component. See useBreakDayState for
              why puzzleKey/dateKey are threaded separately. */}
          {game === "wordle" && (
            <WordleGame
              key={pick}
              answer={activePuzzles.wordleAnswer}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              onPlayAnother={advance}
            />
          )}
          {game === "bee" && (
            <BeeGame
              key={pick}
              puzzle={activePuzzles.bee}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              onPlayAnother={advance}
            />
          )}
          {game === "connections" && (
            <ConnectionsGame
              key={pick}
              puzzle={activePuzzles.connections}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              onPlayAnother={advance}
            />
          )}
          {game === "mini" && (
            <CrosswordGame
              key={pick}
              puzzle={activePuzzles.mini}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              storageKey="mini"
              onPlayAnother={advance}
            />
          )}
          {game === "crossword" && (
            <CrosswordGame
              key={pick}
              puzzle={activePuzzles.midi}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              storageKey="crossword"
              wide
              onPlayAnother={advance}
            />
          )}
          {game === "sudoku" && (
            <SudokuGame key={pick} dateKey={puzzles.dateKey} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          )}
          {game === "letterboxed" && (
            <LetterBoxedGame
              key={pick}
              puzzle={activePuzzles.letterbox}
              dateKey={puzzles.dateKey}
              puzzleKey={activePuzzles.puzzleKey}
              onPlayAnother={advance}
            />
          )}
          {game === "tiles" && (
            <TilesGame key={pick} dateKey={puzzles.dateKey} puzzleKey={activePuzzles.puzzleKey} onPlayAnother={advance} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pt-(--titlebar-height)">
      {/* Owner 2026-08-05: "needs to match the vibe of other pages, with
          title in upper left corner" — the centred serif hero is gone; this
          is the same header every other workspace page uses. */}
      <header className="workspace-page-header flex min-h-12 shrink-0 items-center px-6 py-2.5 max-sm:px-4">
        {/* Inner column matches the card grid's, so the title's left edge and
            the first card's line up at every width. */}
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <h1 className="workspace-page-title">Chill</h1>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground max-sm:hidden">{dateKeyLabel(puzzles.dateKey)}</span>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-2 max-sm:px-4">
        <div className="mx-auto w-full max-w-5xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="break-hub">
            {GAME_CARDS.map((card) => {
              const status = mounted ? cardStatus(card.id, puzzles) : null;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => open(card.id)}
                  data-testid={`break-card-${card.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-(--ui-stroke-tertiary) text-left shadow-[0_3px_12px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-center py-7" style={{ background: BREAK_ACCENTS[card.id] }}>
                    <GameGlyph game={card.id} />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 bg-(--ui-sidebar-surface-background) p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      {/* Sans, not serif: the bright glyph blocks carry the
                          playfulness; the type stays the app's. */}
                      <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{card.name}</h2>
                      {status && (
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] px-2 py-0.5 text-[10px] text-muted-foreground">
                          {status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{card.tagline}</p>
                    <span className="pt-1.5 text-sm font-medium text-(--theme-primary) group-hover:underline">
                      {status ? "Continue" : "Play"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Owner 2026-08-05: "it still says 'puzzles change at midnight' but
              its supposed to be more than 1 game" — every game's ↻ deals a
              fresh puzzle on demand, so midnight is only about the DAILY. */}
          <p className="pt-6 text-center text-xs text-muted-foreground">
            The daily set changes at midnight — and every game can deal you another puzzle whenever you want. Progress stays
            on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
