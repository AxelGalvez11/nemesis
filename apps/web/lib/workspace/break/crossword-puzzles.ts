// Hand-picked mini crossword bank. Grids were machine-filled from a curated
// common-word list (every across AND down run is a real word — the generator
// enforced it), then clued by hand. Clues are original. The tests run
// validateMini over every entry, so structure and clue coverage cannot drift.

import type { MiniPuzzle } from "./crossword";

export const MINI_PUZZLES: MiniPuzzle[] = [
  {
    // BREAK runs straight down the middle — the page's namesake puzzle.
    id: "mini-break",
    rows: ["#BIG#", "ARMOR", "READY", "EAGLE", "#KEY#"],
    clues: {
      across: {
        1: "Opposite of little",
        4: "A knight wears it",
        6: "Set to go",
        7: "Bird on the U.S. seal",
        8: "It opens a lock",
      },
      down: {
        1: "Pause between study sessions — or this page",
        2: "Picture",
        3: "Saintly",
        4: "'We ___ the champions'",
        5: "Deli bread choice",
      },
    },
  },
  {
    id: "mini-chess",
    rows: ["CHESS", "REACH", "ULTRA", "SLEEK", "HONEY"],
    clues: {
      across: {
        1: "Board game with knights and rooks",
        6: "Stretch out to grab",
        7: "Prefix meaning 'extreme'",
        8: "Smooth and shiny",
        9: "What bees make",
      },
      down: {
        1: "Secret schoolyard affection",
        2: "Friendly greeting",
        3: "Like a finished sandwich",
        4: "Loose rock on a mountainside",
        5: "Unsteady",
      },
    },
  },
  {
    id: "mini-ship",
    rows: ["#SHIP", "PIANO", "LEVER", "OVERT", "TENT#"],
    clues: {
      across: {
        1: "Ocean vessel",
        5: "88-key instrument",
        6: "Bar that pries",
        7: "Out in the open",
        8: "Camper's shelter",
      },
      down: {
        1: "Kitchen strainer",
        2: "Safe place",
        3: "Unreactive, in chemistry class",
        4: "Left side of a ship",
        5: "Story arc",
      },
    },
  },
  {
    id: "mini-tomb",
    rows: ["#TOMB", "PIPER", "AGILE", "RENEW", "TREE#"],
    clues: {
      across: {
        1: "Pharaoh's resting place",
        5: "Pied ___ of Hamelin",
        6: "Quick on one's feet",
        7: "Extend, as a library loan",
        8: "Oak or elm",
      },
      down: {
        1: "Striped big cat",
        2: "Offer an opinion",
        3: "Chaotic brawl",
        4: "Make some coffee",
        5: "Portion",
      },
    },
  },
  {
    id: "mini-irk",
    rows: ["##IRK", "#KNEE", "SILLY", "PLAY#", "ANY##"],
    clues: {
      across: {
        1: "Annoy",
        4: "Joint below the thigh",
        5: "Goofy",
        6: "Recess activity",
        7: "Whichever",
      },
      down: {
        1: "Decorative woodwork set into a surface",
        2: "Depend (on)",
        3: "Piano part",
        4: "Potter's oven",
        5: "Place for a massage",
      },
    },
  },
  {
    id: "mini-taxi",
    rows: ["##RAN", "#TAXI", "PUPIL", "IRIS#", "END##"],
    clues: {
      across: {
        1: "Sprinted",
        4: "Cab",
        5: "Student — or part of the eye",
        6: "Colored ring around the pupil",
        7: "Finish",
      },
      down: {
        1: "Very fast",
        2: "Graph line",
        3: "Zero, in a soccer score",
        4: "Rotation",
        5: "Dessert with a crust",
      },
    },
  },
  {
    id: "mini-char",
    rows: ["#CHAR", "#LAVA", "WOVEN", "EVER#", "DENT#"],
    clues: {
      across: {
        1: "Burn slightly",
        5: "Volcano flow",
        6: "Like fabric on a loom",
        7: "'Best day ___!'",
        8: "Fender ding",
      },
      down: {
        1: "Garlic segment",
        2: "Refuge",
        3: "Turn away, as one's eyes",
        4: "Jogged",
        6: "Tie the knot",
      },
    },
  },
  {
    id: "mini-heron",
    rows: ["#RAN#", "HERON", "OBESE", "TENET", "#LAY#"],
    clues: {
      across: {
        1: "Moved on foot, quickly",
        4: "Long-legged wading bird",
        6: "Far beyond overweight",
        7: "Core belief",
        8: "Set down",
      },
      down: {
        1: "One who resists",
        2: "Concert venue",
        3: "Prying",
        4: "Scorching",
        5: "Fisherman's gear",
      },
    },
  },
  {
    id: "mini-order",
    rows: ["#CAB#", "ORDER", "WOOLY", "NOBLE", "#KEY#"],
    clues: {
      across: {
        1: "Ride you hail",
        4: "'___ in the court!'",
        6: "Like a sheep's coat, informally",
        7: "Knightly in character",
        8: "Answer sheet",
      },
      down: {
        1: "Shepherd's staff — or a thief",
        2: "Sun-dried brick",
        3: "Tummy",
        4: "Possess",
        5: "Whiskey grain",
      },
    },
  },
  {
    id: "mini-loom",
    rows: ["#LOOM", "MAUVE", "UNTIL", "SCENT", "HERE#"],
    clues: {
      across: {
        1: "Weaver's frame",
        5: "Pale purple",
        6: "Up to the time of",
        7: "What a bloodhound follows",
        8: "Roll-call reply",
      },
      down: {
        1: "Jouster's weapon",
        2: "___ space",
        3: "Sheep-like",
        4: "Turn to liquid",
        5: "Sled-dog command",
      },
    },
  },
];
