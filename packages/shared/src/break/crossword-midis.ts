// The bigger daily crossword: 7x7 midis on the classic double-spanner
// layout. Grids were machine-filled (curated short words + the high-
// frequency band of the lexicon for long slots; implicit completions held
// to the same bar), then clued by hand. Same engine as the Mini —
// validateMini runs over this bank in the tests too.

import type { MiniPuzzle } from "./crossword.ts";

export const MIDI_PUZZLES: MiniPuzzle[] = [
  {
    id: "midi-dentist",
    rows: ["##BAD##", "#PAPER#", "ARSENAL", "DOE#TIE", "DUMPING", "#DAISY#", "##NET##"],
    clues: {
      across: {
        1: "Not good",
        4: "Essay hand-in",
        6: "Weapons stockpile",
        8: "Deer mother",
        9: "Draw, score-wise",
        10: "Getting rid (of)",
        12: "Flower with white petals",
        13: "Basketball hoop attachment",
      },
      down: {
        1: "First ___ (baseball position)",
        2: "Gorilla, for one",
        3: "Cavity fixer",
        4: "Chest-out feeling",
        5: "Like a stay-inside day",
        6: "Put together",
        7: "Table support",
        11: "Pumpkin ___",
      },
    },
  },
  {
    id: "midi-tuition",
    rows: ["##TAN##", "#SUPER#", "INITIAL", "MAT#TRY", "PRITHEE", "#LOWER#", "##NOR##"],
    clues: {
      across: {
        1: "Beach souvenir",
        4: "Building manager, casually",
        6: "First, as an impression",
        8: "Yoga class need",
        9: "Give it a shot",
        10: "'Please,' to Shakespeare",
        12: "Turn down, as the volume",
        13: "Neither's partner",
      },
      down: {
        1: "The big school bill",
        2: "Fitting",
        3: "Not one or the other",
        4: "Wolf's warning",
        5: "Harder to find",
        6: "Little mischief-maker",
        7: "Soap-making alkali",
        11: "One plus one",
      },
    },
  },
  {
    id: "midi-methane",
    rows: ["##PAR##", "#PANEL#", "GLITTER", "YIN#RAY", "METHANE", "#REACT#", "##DYE##"],
    clues: {
      across: {
        1: "Golf standard",
        4: "Group of experts",
        6: "Craft sparkle that gets everywhere",
        8: "Yang's counterpart",
        9: "Beam of sunshine",
        10: "CH4, in chem class",
        12: "Respond",
        13: "Hair-color chemical",
      },
      down: {
        1: "Like a finished canvas",
        2: "Picnic crasher",
        3: "Follow, as one's steps",
        4: "Gripping tool, usually in a pair",
        5: "Rested against, in Britain",
        6: "Workout spot",
        7: "Deli bread",
        11: "Barn bale",
      },
    },
  },
  {
    id: "midi-custard",
    rows: ["##APE##", "#GUAVA#", "CUSTARD", "OAT#SOY", "PRECISE", "#DROVE#", "##EWE##"],
    clues: {
      across: {
        1: "Chimp cousin",
        4: "Tropical pink fruit",
        6: "Flan's dessert base",
        8: "Overnight ___s",
        9: "___ sauce",
        10: "Exact",
        12: "Took the wheel",
        13: "Sheep she",
      },
      down: {
        1: "Strict and plain",
        2: "Gentle tap",
        3: "Dodging the question",
        4: "Museum watcher",
        5: "Came up",
        6: "Beat walker",
        7: "Easter-egg bath",
        11: "Moo maker",
      },
    },
  },
];
