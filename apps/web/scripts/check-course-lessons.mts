// The rules a lesson has to pass before anyone reads it.
//
// 🔴 EVERY ONE OF THESE EXISTS BECAUSE SOMETHING BROKE. They are not a style guide, they are a list
// of faults that reached a written lesson and had to be found by hand:
//
//   marker with no definition      renders as bare text with a dead dotted underline
//   definition with no marker      the click-a-word feature is silently dead on that section
//   figure key that resolves to    a grey box with a torn-page icon in the middle of a lesson
//     nothing, or to a 404
//   answer index out of range      an unanswerable question
//   objective with no item/card    an objective the course claims to teach and never checks
//   the answer always at B         a learner can score without reading
//   em dash                        owner's rule, 2026-08-25
//   too few words                  measured against the seven hand-written lessons: 383 to 644
//
//   pnpm tsx scripts/check-course-lessons.mts --course anatomy-and-physiology [--fix]
//
// `--fix` does the two things that are safe to do mechanically: replace em dashes with commas, and
// rotate choices so the right answer is not always in the same place. Everything else is a fault
// the writer has to go back and fix, because it means something is missing rather than misplaced.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = process.env.LESSON_OUT ?? "/tmp/nemesis-lessons";

/** From the writing standard. Kept beside the check so the two cannot drift apart. */
const BANNED = [
  "delve", "crucial", "pivotal", "robust", "landscape", "tapestry", "testament", "underscore",
  "underscores", "seamless", "intricate", "meticulous", "meticulously", "foster", "fosters",
  "garner", "showcase", "showcases", "it is important to note", "plays a key role",
  "plays a crucial role", "additionally", "furthermore", "moreover",
];

interface Lesson {
  section_ordinal?: number;
  minutes?: number;
  blocks?: { kind: string; text?: string; fig?: string; caption?: string; objective?: number; question?: string; choices?: string[]; answer?: number; why?: string }[];
  terms?: { term: string; definition: string }[];
  figures?: Record<string, { url: string; alt: string; credit: string }>;
  flashcards?: { front: string; back: string; objective: number }[];
  items?: { objective: number; question: string; choices: string[]; answer: number; why: string }[];
}

function arg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

function undash(lesson: Lesson): void {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "string") value[i] = v.replace(/\s*[—–]\s*/g, ", ");
        else walk(v);
      });
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "string") (value as Record<string, unknown>)[k] = v.replace(/\s*[—–]\s*/g, ", ");
        else walk(v);
      }
    }
  };
  walk(lesson);
}

/** Deterministic from the question text, so a paper is reproducible and a re-check is a no-op. */
function spreadAnswers(lesson: Lesson): void {
  const rotate = (choices: string[], answer: number, seed: string): { choices: string[]; answer: number } => {
    if (choices.length < 3) return { answer, choices };
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const by = h % choices.length;
    return { answer: (answer - by + choices.length) % choices.length, choices: [...choices.slice(by), ...choices.slice(0, by)] };
  };
  for (const block of lesson.blocks ?? []) {
    if (block.kind !== "check" || !block.choices || block.answer === undefined) continue;
    const next = rotate(block.choices, block.answer, block.question ?? "");
    block.choices = next.choices;
    block.answer = next.answer;
  }
  for (const item of lesson.items ?? []) {
    const next = rotate(item.choices, item.answer, item.question);
    item.choices = next.choices;
    item.answer = next.answer;
  }
}

async function loads(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

async function faultsIn(lesson: Lesson, objectives: number): Promise<string[]> {
  const faults: string[] = [];
  const blocks = lesson.blocks ?? [];
  const terms = new Set((lesson.terms ?? []).map((t) => t.term.toLowerCase()));
  const figures = lesson.figures ?? {};

  const prose = blocks.filter((b) => b.kind === "heading" || b.kind === "text");
  const words = prose.reduce((n, b) => n + (b.text ?? "").trim().split(/\s+/).filter(Boolean).length, 0);
  // 🔴 A CEILING AS WELL AS A FLOOR, AND ONLY THE FLOOR EXISTED. A writer's first draft came in at
  // 834 words and passed; it noticed against the written standard and trimmed it by hand, which is
  // luck rather than a check. Long is a real fault here: the seven hand-written lessons run 383 to
  // 644 words, and a section that runs half as long again is padding or is teaching the next
  // section's material as well as its own.
  if (words < 320) faults.push(`only ${words} words of lesson, the hand-written seven run 383 to 644`);
  if (words > 700) faults.push(`${words} words of lesson, the hand-written seven run 383 to 644; cut it`);
  if (prose.length < 4) faults.push(`only ${prose.length} heading/text blocks`);

  const marked = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "text" || block.kind === "heading") {
      for (const m of (block.text ?? "").matchAll(/\[\[([^\]]+)\]\]/g)) {
        const word = (m[1] ?? "").toLowerCase();
        marked.add(word);
        if (!terms.has(word)) faults.push(`marker [[${m[1]}]] has no entry in terms`);
      }
    }
    if (block.kind === "figure") {
      const fig = figures[block.fig ?? ""];
      if (!fig) faults.push(`figure "${block.fig}" is not in the figures map`);
      else if (!(await loads(fig.url))) faults.push(`figure "${block.fig}" does not load: ${fig.url}`);
    }
    if (block.kind === "check") {
      const choices = block.choices ?? [];
      if (choices.length < 3) faults.push("a check has fewer than 3 choices");
      if (block.answer === undefined || block.answer < 0 || block.answer >= choices.length) {
        faults.push(`check answer ${block.answer} is outside its ${choices.length} choices`);
      }
      if (block.objective === undefined || block.objective < 0 || block.objective >= objectives) {
        faults.push(`check objective ${block.objective} is outside 0..${objectives - 1}`);
      }
    }
  }
  for (const t of lesson.terms ?? []) {
    if (!marked.has(t.term.toLowerCase())) faults.push(`"${t.term}" is defined but never marked in the passage`);
  }

  const items = lesson.items ?? [];
  const cards = lesson.flashcards ?? [];
  if (items.length < 10) faults.push(`only ${items.length} test items, need at least 10`);
  if (cards.length < 7) faults.push(`only ${cards.length} flashcards, need at least 7`);
  for (const item of items) {
    if (item.answer < 0 || item.answer >= (item.choices ?? []).length) faults.push(`item answer ${item.answer} out of range`);
    if (item.objective < 0 || item.objective >= objectives) faults.push(`item objective ${item.objective} out of range`);
  }
  for (let o = 0; o < objectives; o += 1) {
    if (!items.some((i) => i.objective === o)) faults.push(`objective ${o} has no test item`);
    if (!cards.some((c) => c.objective === o)) faults.push(`objective ${o} has no flashcard`);
  }

  if (/[—–]/.test(JSON.stringify(lesson))) faults.push("an em dash or en dash is present (run with --fix)");

  // 🔴🔴 THE STANDARD HAD A BAN LIST AND NOTHING CHECKED IT. Same shape of gap as the missing word
  // ceiling: a rule that lives only in prose is a rule that holds until the first writer in a hurry.
  // These are the words that make writing read as generated, and one of them per lesson is a
  // coincidence while three is a signature.
  const prose_text = prose.map((b) => b.text ?? "").join(" ").toLowerCase();
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}\\b`).test(prose_text)) faults.push(`banned word or phrase: "${word}"`);
  }

  // 🔴 A HEADING IS A SENTENCE, NOT A LABEL, and the cheapest tell is length. "Anatomy" is a label;
  // "Anatomy is the study of structure" teaches the section to somebody reading only the headings.
  // Four words is a low bar deliberately: it catches the bare topic noun without arguing about
  // style. The shortest heading in the hand-written seven is four words.
  for (const b of blocks) {
    if (b.kind !== "heading") continue;
    const n = (b.text ?? "").trim().split(/\s+/).filter(Boolean).length;
    if (n < 4) faults.push(`heading "${b.text}" is ${n} words; a heading states the idea, it does not label it`);
  }

  // 🔴 A FIGURE IN THE MAP THAT NO BLOCK USES IS DEAD WEIGHT, and it is usually the sign of a
  // figure block that was written and then removed without its entry.
  const used = new Set(blocks.filter((b) => b.kind === "figure").map((b) => b.fig));
  for (const key of Object.keys(figures)) {
    if (!used.has(key)) faults.push(`figure "${key}" is in the map but no block shows it`);
  }
  return faults;
}

async function main(): Promise<void> {
  const slug = arg("course");
  if (!slug) throw new Error("pass --course <slug>");
  const fix = process.argv.includes("--fix");

  // Objectives come from the brief beside each lesson, so this needs no second network read.
  const dir = join(OUT, slug);
  const files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));

  let clean = 0;
  for (const file of files) {
    const lesson = JSON.parse(await readFile(join(dir, file), "utf8")) as Lesson;
    const brief = await readFile(join(dir, `brief-${file.replace(".json", "")}.md`), "utf8").catch(() => "");
    const objectives = (brief.match(/^\[\d+\] /gm) ?? []).length;
    if (objectives === 0) {
      console.log(`${file}: no brief beside it, cannot check objective coverage`);
      continue;
    }
    if (fix) {
      undash(lesson);
      spreadAnswers(lesson);
      await writeFile(join(dir, file), JSON.stringify(lesson, null, 1));
    }
    const faults = await faultsIn(lesson, objectives);
    if (faults.length === 0) {
      clean += 1;
      console.log(`${file}: ok`);
    } else {
      console.log(`${file}: ${faults.length} fault(s)`);
      for (const f of faults) console.log(`    ${f}`);
    }
  }
  console.log(`\n${clean} of ${files.length} lessons are clean`);
}

await main();
