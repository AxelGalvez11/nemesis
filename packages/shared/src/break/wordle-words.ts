// Daily word-game vocabulary. ANSWERS is the hand-curated daily sequence —
// only ordinary words a tired student won't resent (the day number walks the
// list in order, so consecutive days never repeat until the list wraps). The
// much larger accepted-guess list lives in wordle-guess-list.ts; answers are
// unioned in, so an answer can always be typed even if the old dictionary
// happens to lack it.

import { WORDLE_GUESS_LIST } from "./wordle-guess-list.ts";

export const WORDLE_ANSWERS: string[] = [
  "break", "study", "brain", "focus", "learn", "think", "smart", "sharp", "quick", "fresh",
  "chalk", "paper", "pilot", "crane", "slate", "audio", "house", "plant", "stone", "light",
  "money", "music", "dream", "beach", "cloud", "storm", "grape", "lemon", "olive", "peach",
  "bread", "cream", "honey", "spice", "sugar", "toast", "salad", "pasta", "pizza", "candy",
  "chair", "table", "couch", "shelf", "clock", "phone", "radio", "brick", "glass", "metal",
  "cable", "mouse", "click", "track", "field", "score", "coach", "medal", "champ", "vault",
  "swing", "pitch", "catch", "throw", "relay", "ocean", "river", "creek", "shore", "whale",
  "shark", "otter", "eagle", "robin", "finch", "goose", "raven", "tiger", "zebra", "koala",
  "panda", "sloth", "camel", "moose", "bison", "llama", "horse", "amber", "azure", "ivory",
  "khaki", "mauve", "pearl", "sepia", "beige", "coral", "daisy", "tulip", "poppy", "lilac",
  "cider", "maple", "birch", "aspen", "holly", "berry", "mango", "melon", "apple", "guava",
  "lunar", "solar", "comet", "orbit", "space", "probe", "flare", "globe", "atlas", "world",
  "equal", "angle", "curve", "graph", "ratio", "prime", "digit", "count", "tally", "chart",
  "essay", "quote", "verse", "novel", "prose", "drama", "stage", "actor", "scene", "opera",
  "judge", "court", "legal", "claim", "trial", "proof", "logic", "ethic", "civic", "voter",
  "nurse", "fever", "pulse", "elbow", "wrist", "ankle", "spine", "thumb", "heart", "torso",
  "waltz", "tango", "salsa", "polka", "disco", "vinyl", "tempo", "chord", "flute", "cello",
  "viola", "banjo", "organ", "bugle", "siren", "piano", "forte", "minor", "major", "scale",
  "pause", "sleep", "relax", "quiet", "peace", "bliss", "smile", "laugh", "happy", "merry",
  "brave", "proud", "noble", "loyal", "frank", "witty", "droll", "canny", "savvy", "blunt",
  "mirth", "cheer", "party", "dance", "feast", "treat", "prize", "badge", "crown", "token",
  "quest", "climb", "trail", "ridge", "slope", "cliff", "ledge", "gorge", "delta", "plain",
  "lodge", "cabin", "hotel", "motel", "suite", "lobby", "porch", "patio", "bench", "arbor",
  "mount", "coast", "inlet", "bayou", "marsh", "swamp", "oasis", "grove", "heath", "bluff",
  "train", "plane", "truck", "wagon", "canoe", "kayak", "yacht", "ferry", "barge", "sedan",
  "wheel", "brake", "motor", "pedal", "cargo", "route", "depot", "crank", "lever", "chain",
  "smoke", "torch", "blaze", "spark", "flame", "steam", "frost", "chill", "polar", "sunny",
  "rainy", "foggy", "windy", "humid", "muggy", "balmy", "crisp", "clear", "vivid", "faded",
  "alarm", "awake", "early", "tardy", "night", "today", "diary", "month", "epoch", "timer",
  "seven", "eight", "three", "forty", "sixty", "ninth", "tenth", "first", "third", "fifth",
  "lucky", "charm", "magic", "trick", "poker", "chess", "rummy", "bingo", "skate", "hobby",
  "paint", "brush", "easel", "mural", "craft", "weave", "quilt", "fiber", "linen", "denim",
  "tutor", "teach", "grade", "skill", "drill", "recap", "vocab", "index", "quota", "topic",
  "onion", "basil", "thyme", "mocha", "latte", "cocoa", "syrup", "wafer", "donut", "bagel",
  "grill", "roast", "saute", "knead", "whisk", "ladle", "apron", "stove", "plate", "spoon",
];

/** Everything a player may type: the generated list plus every answer. */
export function wordleAllowedSet(): Set<string> {
  const allowed = new Set(WORDLE_GUESS_LIST.split(" "));
  for (const answer of WORDLE_ANSWERS) allowed.add(answer);
  return allowed;
}
