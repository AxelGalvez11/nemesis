// Reading a WHOLE source when a source is longer than one prompt.
//
// Generation clips its material to MATERIAL_CHAR_LIMIT. In a real pharmacology
// course that meant 58 of 134 files were read only in part — a single pass covered
// 55% of the text, and the Orange Book, at 200,000 characters, was read down to its
// first twenty-second. A student who imports a lecture and asks for a test has no way
// to know the questions came from the opening slides alone.
//
// Improving slide extraction makes this WORSE, not better: notes, chart labels and
// figure descriptions all make a deck longer, so a fixed clip covers a smaller share
// of it than before. Reading everything is therefore part of the same job.
//
// So a long source is split into ordered chunks that each fit, every chunk is read,
// and the results are interleaved — question 1 from the start of the lecture,
// question 2 from the middle, and so on — because taking the first N would leave a
// "complete" test that never mentions the second half of the material.
//
// PURE: text in, chunks and counts out.

/** As much source as one generation prompt carries. */
export const MATERIAL_CHAR_LIMIT = 9_000;
/** Most chunks one deliverable will read. Twelve chunks is ~108,000 characters — far
 *  past any lecture — and bounds what a pathological upload can spend. */
export const MAX_CHUNKS = 12;
/** The generator's own floor: asking for fewer than three questions returns three
 *  anyway, so apportioning below this would misreport what each chunk contributes. */
export const MIN_PER_CHUNK = 3;

/**
 * Split a source into ordered pieces that each fit a prompt, breaking at paragraph
 * boundaries so a chunk is never half a sentence. A single paragraph longer than the
 * limit is cut at the last space before it. PURE.
 */
export function chunkMaterial(text: string, limit = MATERIAL_CHAR_LIMIT, maxChunks = MAX_CHUNKS): string[] {
  const source = text.trim();
  if (!source) return [];
  if (source.length <= limit) return [source];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const paragraph of source.split(/\n{2,}/)) {
    let block = paragraph;
    // A single oversized paragraph (a wall of transcript, a table) is cut down to
    // size first, so the accumulation below only ever sees pieces that can fit.
    while (block.length > limit) {
      const window = block.slice(0, limit);
      const cut = window.lastIndexOf(" ");
      const head = cut > limit * 0.5 ? window.slice(0, cut) : window;
      flush();
      chunks.push(head.trim());
      block = block.slice(head.length);
    }
    if (current && current.length + block.length + 2 > limit) flush();
    current = current ? `${current}\n\n${block}` : block;
  }
  flush();

  if (chunks.length <= maxChunks) return chunks;
  // Past the ceiling, keep an evenly spread sample rather than the opening chunks:
  // a partial read of the whole document beats a complete read of its first tenth.
  const step = chunks.length / maxChunks;
  return Array.from({ length: maxChunks }, (_, i) => chunks[Math.floor(i * step)]!);
}

/**
 * How many items to ask of each chunk, in proportion to how much material it holds,
 * never fewer than the generator's floor. The total may exceed `wanted` — the extra
 * is trimmed by interleave(), which is what keeps the coverage. PURE.
 */
export function apportion(wanted: number, chunkLengths: readonly number[]): number[] {
  if (chunkLengths.length === 0) return [];
  if (chunkLengths.length === 1) return [Math.max(wanted, MIN_PER_CHUNK)];
  const total = chunkLengths.reduce((sum, length) => sum + length, 0) || 1;
  return chunkLengths.map((length) => Math.max(MIN_PER_CHUNK, Math.round((wanted * length) / total)));
}

/**
 * Take one item from each chunk in turn until `wanted` are collected, so a trimmed
 * result still spans the whole source. Order within a chunk is preserved.
 *
 * `keyOf` drops repeats. Each chunk is written blind to the others, and consecutive
 * chunks of one lecture cover the same ground — half-life, first-pass metabolism —
 * so two of them will produce the same question. Reading only part of a source
 * produced a test that was quietly incomplete; reading all of it would produce one
 * that is visibly repetitive, which a student reads as a broken feature. When a
 * repeat is dropped the round continues, so the count is topped up from what is
 * left rather than coming back short. PURE.
 */
export function interleave<T>(
  perChunk: ReadonlyArray<readonly T[]>,
  wanted: number,
  keyOf?: (item: T) => string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const deepest = Math.max(0, ...perChunk.map((chunk) => chunk.length));
  for (let round = 0; round < deepest && out.length < wanted; round += 1) {
    for (const chunk of perChunk) {
      if (out.length >= wanted) break;
      const item = chunk[round];
      if (item === undefined) continue;
      if (keyOf) {
        const key = keyOf(item);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(item);
    }
  }
  return out;
}

/** Two questions are the same question when their wording matches once spacing,
 *  case and trailing punctuation are set aside. PURE. */
export function questionKey(question: { q: string }): string {
  return question.q.toLowerCase().replace(/\s+/g, " ").replace(/[\s?.:;!]+$/, "").trim();
}

/**
 * Merge several mind-map outlines into one. The first root heading is kept and the
 * others' branches hang beneath it; identical node labels are folded together, since
 * two chunks of one lecture will both name the drug the lecture is about. PURE.
 */
export function mergeOutlines(outlines: readonly string[], maxNodes = 35): string | null {
  const usable = outlines.map((outline) => outline.trim()).filter(Boolean);
  if (usable.length === 0) return null;

  const rootLine = usable[0]!.split(/\r?\n/).find((line) => /^#\s/.test(line.trim()));
  const root = rootLine?.trim() ?? "# Overview";
  const seen = new Set<string>();
  const branches: string[] = [];
  for (const outline of usable) {
    for (const line of outline.split(/\r?\n/)) {
      const trimmed = line.trimEnd();
      if (!trimmed.trim() || /^#{1,6}\s/.test(trimmed.trim())) continue;
      const label = trimmed.trim().toLowerCase();
      if (seen.has(label)) continue;
      seen.add(label);
      branches.push(trimmed);
      if (branches.length >= maxNodes) break;
    }
    if (branches.length >= maxNodes) break;
  }
  return [root, ...branches].join("\n");
}
