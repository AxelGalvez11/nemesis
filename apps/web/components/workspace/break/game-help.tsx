"use client";

// "How to play" for each Break game (owner 2026-08-04: "some instruction for
// each game (and a 'do not show again' box option)"). Auto-opens on a game's
// first visit; the checkbox writes a per-game flag so it never comes back
// unless the ? button asks for it.

import { useState } from "react";

import type { BreakGameId } from "@/components/workspace/break/break-workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";

const HELP_FLAG_PREFIX = "nemesis.web.break.help.";

export function helpSeen(game: BreakGameId): boolean {
  try {
    return window.localStorage.getItem(HELP_FLAG_PREFIX + game) === "hide";
  } catch {
    return true; // no storage → don't nag on every mount
  }
}

function markHelpHidden(game: BreakGameId, hide: boolean): void {
  try {
    if (hide) window.localStorage.setItem(HELP_FLAG_PREFIX + game, "hide");
    else window.localStorage.removeItem(HELP_FLAG_PREFIX + game);
  } catch {
    // Best-effort.
  }
}

function WordleExample() {
  const tile = "flex size-8 items-center justify-center rounded-sm text-sm font-bold uppercase text-white";
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <span className={tile} style={{ background: "#6aaa64" }}>b</span>
      <span className={tile} style={{ background: "#c9b458" }}>r</span>
      <span className={tile} style={{ background: "#787c7e" }}>a</span>
      <span className="pl-2 text-xs text-muted-foreground">green = right spot · yellow = wrong spot · gray = not in the word</span>
    </div>
  );
}

function ConnectionsExample() {
  return (
    <div className="flex items-center gap-1.5 pt-1">
      {["#f5d76b", "#a8c66c", "#a9c1ef", "#c39bd3"].map((tone) => (
        <span key={tone} className="size-4 rounded-full" style={{ background: tone }} />
      ))}
      <span className="pl-2 text-xs text-muted-foreground">yellow is the easiest group, purple the trickiest</span>
    </div>
  );
}

const HELP: Record<BreakGameId, { title: string; intro: string; points: string[]; example?: React.ReactNode }> = {
  wordle: {
    title: "How to play Word Guess",
    intro: "Guess the five-letter word in six tries.",
    points: [
      "Type a real five-letter word and press Enter.",
      "After each guess the tiles change color to show how close you are.",
      "The keyboard remembers what you've learned — gray keys are dead ends.",
      "One word per day; everyone gets the same one.",
    ],
    example: <WordleExample />,
  },
  bee: {
    title: "How to play Honeycomb",
    intro: "Make as many words as you can from today's seven letters.",
    points: [
      "Words need at least 4 letters, and must use the center letter.",
      "Letters can repeat — 'noon' is fine if the letters are there.",
      "Longer words score more. Use all seven letters at once for a pangram bonus.",
      "Ranks climb from Beginner to Genius as your score grows.",
    ],
  },
  connections: {
    title: "How to play Groups",
    intro: "Sixteen words hide four groups of four.",
    points: [
      "Select four words that share something, then press Submit.",
      "\"One away…\" means exactly three of your four belong together.",
      "You have four mistakes. Duplicate guesses don't cost one.",
      "Watch for traps — a word often looks like it fits two groups.",
    ],
    example: <ConnectionsExample />,
  },
  mini: {
    title: "How to play the Mini",
    intro: "A five-by-five crossword you can finish before class.",
    points: [
      "Click a square and type. Clicking the same square flips between Across and Down (Space does too).",
      "Tab jumps to the next clue; arrow keys move around the grid.",
      "Check marks any wrong letters in red. Reveal fills the answer if you're truly stuck.",
      "The clock is just for bragging rights.",
    ],
  },
  crossword: {
    title: "How to play the Crossword",
    intro: "The Mini's bigger sibling — seven by seven, with two long answers each way.",
    points: [
      "Same controls as the Mini: type to fill, Space flips direction, Tab jumps clues.",
      "The long answers cross everything — crack one and the corners open up.",
      "Check marks wrong letters; Reveal is there if a corner defeats you.",
    ],
  },
  sudoku: {
    title: "How to play Sudoku",
    intro: "Fill the grid so every row, column, and box holds 1 through 9 exactly once.",
    points: [
      "Click a square, then type a digit or use the pad below.",
      "Notes mode (or the N key) pencils small candidates into a square.",
      "Clashing digits turn red on their own; Check compares against the answer.",
      "Today's board has exactly one solution — no guessing ever needed.",
    ],
  },
  letterboxed: {
    title: "How to play Letter Box",
    intro: "Spell words around the square until all 12 letters are used.",
    points: [
      "Consecutive letters must come from different sides of the box.",
      "Each new word starts with the last letter of the one before it.",
      "Letters can repeat. Fewer words is better — today's box has a 2-word answer.",
      "Restart clears the chain if you paint yourself into a corner.",
    ],
  },
  tiles: {
    title: "How to play Tiles",
    intro: "Clear the board by matching layers, not whole tiles.",
    points: [
      "Every tile stacks a color, a ring, and a symbol.",
      "Pick two tiles that share any layer — the shared layers vanish from both.",
      "A pick with nothing in common breaks your chain and resets the counter.",
      "Empty tiles disappear. Clear everything; chase a longer chain tomorrow.",
    ],
  },
};

export function GameHelp({
  game,
  open,
  onOpenChange,
}: {
  game: BreakGameId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [hideNextTime, setHideNextTime] = useState(false);
  const content = HELP[game];

  const close = (next: boolean) => {
    if (!next) markHelpHidden(game, hideNextTime);
    onOpenChange(next);
  };

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-w-md" data-testid="break-help">
        <DialogHeader>
          <DialogTitle className="font-serif">{content.title}</DialogTitle>
          <DialogDescription>{content.intro}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {content.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {content.example}
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              checked={hideNextTime}
              className="size-3.5 cursor-pointer accent-(--theme-primary)"
              data-testid="break-help-hide"
              onChange={(event) => setHideNextTime(event.target.checked)}
              type="checkbox"
            />
            Don't show this again
          </label>
          <Button size="sm" className="rounded-full px-5" onClick={() => close(false)} data-testid="break-help-play">
            Play
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
