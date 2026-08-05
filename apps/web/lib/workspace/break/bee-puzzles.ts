// Honeycomb puzzle bank. Letter sets are hand-picked; each accepted-word
// list is the union of a hand-curated seed and every common-English word
// that legally fits the letters — "common English" = the 50k most frequent
// words intersected with the system dictionary (frequency kills 1934
// archaisms, the dictionary kills slang/typos/names), then hand-pruned of
// proper nouns and words a study app shouldn't accept (owner 2026-08-04:
// "some words arent allowed despite being valid" — the original curated-only
// lists were too thin). Regenerate with scratchpad/regen-bee.mts.
// The test suite runs validateBeePuzzle over the whole bank.

import type { BeePuzzle } from "./bee";

export const BEE_PUZZLES: BeePuzzle[] = [
  {
    center: "n",
    outer: ["o", "t", "a", "i", "c", "v"],
    words: [
      "actin", "action", "activation", "anoint", "anon", "anti", "atonic", "attain",
      "avian", "aviation", "avocation", "cancan", "cannon", "cannot", "canon", "cant",
      "cantina", "canto", "canton", "catatonic", "cation", "cavitation", "citation", "cocoon",
      "coin", "concoct", "concoction", "connotation", "contact", "contain", "convict", "conviction",
      "cotton", "icon", "iconic", "inaction", "initiation", "innovation", "intact", "into",
      "invitation", "ionic", "naan", "nation", "noon", "notation", "notion", "nova",
      "octant", "onion", "onto", "ovation", "taint", "tannic", "tannin", "tint",
      "titan", "titanic", "tonic", "toon", "vacant", "vacation", "vain", "vino",
      "vocation",
    ],
  },
  {
    center: "l",
    outer: ["h", "o", "i", "d", "a", "y"],
    words: [
      "allay", "alloy", "ally", "dahlia", "daily", "dally", "dial", "dill",
      "dilly", "doily", "doll", "dolly", "hail", "halal", "hall", "halo",
      "hill", "hilly", "hold", "holiday", "holly", "holy", "idly", "idol",
      "idyll", "lady", "laid", "lido", "lily", "load", "lolly", "loyal",
      "loyally", "oddly", "oily",
    ],
  },
  {
    center: "t",
    outer: ["c", "e", "r", "a", "i", "n"],
    words: [
      "accent", "actin", "ancient", "ante", "anteater", "antenna", "antennae", "anti",
      "arctic", "attain", "attic", "attire", "attract", "cacti", "cant", "canteen",
      "canter", "cantina", "carat", "cart", "carte", "cataract", "cater", "caterer",
      "cent", "center", "certain", "cite", "crate", "crater", "create", "cretin",
      "criteria", "critic", "eaten", "eater", "eccentric", "enact", "enter", "entertain",
      "entice", "entire", "entrance", "entreat", "entree", "erect", "errant", "erratic",
      "incarnate", "incinerate", "incite", "inert", "inertia", "initiate", "innate", "intact",
      "intent", "inter", "interact", "intern", "intricate", "irate", "irritate", "iterate",
      "itinerant", "narrate", "neat", "nectar", "nineteen", "nitrate", "nitric", "rant",
      "rate", "react", "recant", "recent", "recite", "recreate", "reiterate", "rent",
      "renter", "retain", "retainer", "reticent", "retina", "retire", "retrace", "retract",
      "retreat", "rite", "tacit", "tact", "tactic", "taint", "tantric", "tarn",
      "tart", "tartan", "tartar", "tater", "tear", "teat", "teen", "tenant",
      "tenner", "tent", "terrace", "terrain", "terrier", "tetra", "tiara", "tier",
      "tine", "tint", "tire", "titan", "titanic", "trace", "tracer", "tract",
      "train", "trainee", "trainer", "trait", "trance", "treat", "tree", "trier",
      "trine", "trite",
    ],
  },
  {
    center: "o",
    outer: ["e", "l", "a", "t", "i", "n"],
    words: [
      "alienation", "allot", "aloe", "alone", "alto", "anoint", "anon", "atoll",
      "atonal", "atone", "attention", "elation", "initiation", "intention", "into", "iota",
      "lion", "loan", "loin", "lone", "loon", "loot", "lotion", "lotto",
      "nation", "national", "neon", "noel", "none", "noon", "notation", "note",
      "notion", "onion", "onto", "talon", "tattoo", "titillation", "toenail", "toil",
      "toilet", "toll", "tonal", "tone", "tool", "toon", "toot", "total",
      "tote",
    ],
  },
  {
    center: "o",
    outer: ["h", "a", "r", "m", "n", "y"],
    words: [
      "ahoy", "ammo", "annoy", "anon", "armor", "armory", "aroma", "arroyo",
      "harmony", "hoary", "honor", "honorary", "horn", "horror", "manor", "maroon",
      "mayor", "moan", "mommy", "mono", "moon", "moor", "moray", "morn",
      "moron", "noon", "norm", "rayon", "roam", "roan", "roar", "room",
      "roomy", "yahoo",
    ],
  },
  {
    center: "e",
    outer: ["f", "d", "b", "a", "c", "k"],
    words: [
      "abed", "added", "babe", "backed", "bade", "bake", "baked", "bead",
      "beaded", "beak", "beck", "bedded", "beef", "beefcake", "cake", "cede",
      "dead", "deaf", "decade", "decaf", "deck", "decked", "deed", "ebbed",
      "efface", "effaced", "facade", "face", "faced", "fade", "faded", "fake",
      "faked", "feed", "feedback", "kebab",
    ],
  },
  {
    center: "o",
    outer: ["d", "l", "p", "h", "i", "n"],
    words: [
      "dodo", "doll", "dollop", "dolphin", "hippo", "hold", "hood", "hoodoo",
      "hoop", "idol", "lido", "lion", "loin", "lollipop", "loon", "loop",
      "noon", "onion", "opinion", "plod", "plop", "polio", "poll", "polo",
      "pond", "pooh", "pool", "poop",
    ],
  },
  {
    center: "i",
    outer: ["m", "d", "p", "o", "n", "t"],
    words: [
      "dint", "ditto", "dominion", "domino", "idiom", "idiot", "into", "midpoint",
      "mind", "mini", "minion", "mint", "mitt", "motion", "notion", "omit",
      "onion", "opinion", "option", "pinpoint", "pint", "pinto", "pippin", "point",
      "potion", "timid", "tint",
    ],
  },
  {
    center: "a",
    outer: ["e", "g", "p", "l", "n", "t"],
    words: [
      "agent", "algae", "angel", "angle", "ante", "antenna", "antennae", "apnea",
      "appeal", "appellate", "apple", "eagle", "eaten", "eggplant", "elegant", "engage",
      "entangle", "gage", "gaggle", "gala", "gale", "gall", "gallant", "gang",
      "gape", "gate", "glean", "gnat", "lane", "lapel", "late", "latent",
      "lean", "leant", "leap", "leapt", "legal", "legate", "nape", "natal",
      "neat", "negate", "pagan", "page", "pageant", "palate", "pale", "palette",
      "pall", "pallet", "pane", "panel", "pang", "pant", "papa", "papal",
      "pate", "patent", "peal", "peat", "penal", "pennant", "petal", "plan",
      "plane", "planet", "plant", "plate", "plea", "pleat", "tale", "talent",
      "tall", "tang", "tangent", "tangle", "tape", "tattle", "tattletale", "teal",
      "teat", "teenage", "telltale", "tenant",
    ],
  },
  {
    center: "r",
    outer: ["f", "o", "m", "u", "l", "a"],
    words: [
      "afar", "alarm", "amoral", "amour", "armor", "aroma", "aura", "aurora",
      "farm", "floor", "flora", "floral", "flour", "fora", "form", "formal",
      "formula", "forum", "four", "from", "furl", "furor", "molar", "moor",
      "moral", "mural", "murmur", "oral", "roam", "roar", "roll", "roof",
      "room", "roomful", "ruff", "rumor", "rural",
    ],
  },
  {
    center: "o",
    outer: ["n", "e", "t", "w", "r", "k"],
    words: [
      "error", "keno", "knot", "know", "known", "kowtow", "neon", "network",
      "newton", "none", "nook", "noon", "note", "onto", "otter", "owner",
      "renown", "retort", "rework", "rook", "root", "rote", "rotor", "rotten",
      "tenor", "terror", "token", "tone", "toner", "took", "toon", "toot",
      "tore", "torn", "torrent", "tort", "tote", "tower", "town", "trot",
      "trotter", "woke", "wont", "wonton", "wore", "work", "worker", "worn",
      "wrote",
    ],
  },
  {
    center: "a",
    outer: ["u", "p", "g", "r", "d", "e"],
    words: [
      "adage", "added", "adder", "aged", "agree", "agreed", "appear", "appeared",
      "area", "argue", "argued", "augur", "aura", "dagger", "dapper", "dare",
      "dead", "dear", "degrade", "degraded", "drag", "dragged", "drape", "draper",
      "dread", "eager", "egad", "gage", "gape", "garage", "gauge", "gear",
      "geared", "grad", "grade", "graded", "grader", "grape", "grappa", "guard",
      "guarded", "padre", "page", "paged", "pager", "papa", "paper", "parade",
      "pauper", "pear", "prepare", "prepared", "radar", "raga", "rage", "rager",
      "ragged", "rapper", "rare", "read", "reader", "reap", "reaper", "reappear",
      "rear", "regard", "reread", "upgrade", "upgraded",
    ],
  },];
