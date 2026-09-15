/**
 * Rich text the way the web stores a block title (apps/web/space/app/main.js richToHtml0 / domToRich / applyMention):
 * segments `[text, marks?]`. Marks: ['b'] bold, ['i'] italic, ['_'] underline, ['s'] strike, ['c'] code, ['a', url],
 * ['h', color]. A mention is the one-character text '‣' carrying ['p', pageId] (or 'u' person, 'd' date).
 *
 * The phone edits in a plain TextInput, so each change is diffed against what the field showed (common prefix and
 * suffix) and applied to the segments: marks outside the changed stretch survive, typed text takes the marks of the
 * character before it, and a mention that is cut into turns into plain text. A mention shows as its page's title.
 */
export type Mark = [string] | [string, string];
export type Seg = [string] | [string, Mark[]];
export type TitleOf = (pageId: string) => string;

export function segsOf(title: unknown): Seg[] {
  if (typeof title === 'string') return title ? [[title]] : [];
  if (!Array.isArray(title)) return [];
  const out: Seg[] = [];
  for (const raw of title) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string') continue;
    const marks = Array.isArray(raw[1]) ? (raw[1] as unknown[]).filter((m): m is Mark => Array.isArray(m) && typeof m[0] === 'string') : [];
    out.push(withMarks(raw[0], marks));
  }
  return out;
}

export const mentionOf = (seg: Seg): Mark | undefined => seg[1]?.find((m) => m[0] === 'p' || m[0] === 'u' || m[0] === 'd');

export function segDisplay(seg: Seg, titleOf: TitleOf): string {
  const m = mentionOf(seg);
  if (!m) return seg[0];
  if (m[0] === 'p') return titleOf(m[1] ?? '') || 'Untitled';
  if (m[0] === 'd') return '@' + String(m[1] ?? '').split('T')[0];
  return '@someone';
}

export const plainOf = (segs: Seg[], titleOf: TitleOf): string => segs.map((s) => segDisplay(s, titleOf)).join('');

/** The stored characters (a mention counts as its '‣'), what `recordText` reads back. */
export const rawText = (segs: Seg[]): string => segs.map((s) => s[0]).join('');

export const sameSegs = (a: Seg[], b: Seg[]): boolean => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

function withMarks(text: string, marks?: Mark[]): Seg {
  return marks && marks.length ? [text, marks] : [text];
}

function normalize(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s[0]) continue;
    const last = out[out.length - 1];
    if (last && !mentionOf(last) && !mentionOf(s) && JSON.stringify(last[1] ?? []) === JSON.stringify(s[1] ?? [])) {
      out[out.length - 1] = withMarks(last[0] + s[0], last[1]);
    } else out.push(s);
  }
  return out;
}

/** The segments covering displayed characters [from, to). */
function slice(segs: Seg[], from: number, to: number, titleOf: TitleOf): Seg[] {
  const out: Seg[] = [];
  let pos = 0;
  for (const seg of segs) {
    const d = segDisplay(seg, titleOf);
    const a = pos;
    const b = pos + d.length;
    pos = b;
    const s = Math.max(a, from);
    const e = Math.min(b, to);
    if (e <= s) continue;
    if (s === a && e === b) out.push(seg);
    else if (mentionOf(seg)) out.push([d.slice(s - a, e - a)]);
    else out.push(withMarks(seg[0].slice(s - a, e - a), seg[1]));
  }
  return out;
}

/** Marks new typing at `at` picks up: those of the character before it (the first character at the start). */
function typingMarks(segs: Seg[], at: number, titleOf: TitleOf): Mark[] | undefined {
  const probe = Math.max(0, at - 1);
  let pos = 0;
  for (const seg of segs) {
    const len = segDisplay(seg, titleOf).length;
    if (probe < pos + len) return mentionOf(seg) ? undefined : seg[1]?.filter((m) => m[0] !== 'a');
    pos += len;
  }
  const last = segs[segs.length - 1];
  return last && !mentionOf(last) ? last[1]?.filter((m) => m[0] !== 'a') : undefined;
}

export function applyEdit(segs: Seg[], next: string, titleOf: TitleOf): Seg[] {
  const old = plainOf(segs, titleOf);
  if (old === next) return segs;
  const max = Math.min(old.length, next.length);
  let p = 0;
  while (p < max && old[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const inserted = next.slice(p, next.length - s);
  return normalize([
    ...slice(segs, 0, p, titleOf),
    ...(inserted ? [withMarks(inserted, typingMarks(segs, p, titleOf))] : []),
    ...slice(segs, old.length - s, old.length, titleOf),
  ]);
}

/** Whether every text character in [from, to) carries `key` (the whole line when nothing is selected). */
export function hasMark(segs: Seg[], from: number, to: number, key: string, titleOf: TitleOf): boolean {
  const [a, b] = range(segs, from, to, titleOf);
  const mid = slice(segs, a, b, titleOf).filter((x) => !mentionOf(x));
  return mid.length > 0 && mid.every((x) => x[1]?.some((m) => m[0] === key));
}

export function toggleMark(segs: Seg[], from: number, to: number, key: string, titleOf: TitleOf): Seg[] {
  const [a, b] = range(segs, from, to, titleOf);
  const on = hasMark(segs, a, b, key, titleOf);
  const len = plainOf(segs, titleOf).length;
  const mid = slice(segs, a, b, titleOf).map((x): Seg => {
    if (mentionOf(x)) return x;
    const rest = (x[1] ?? []).filter((m) => m[0] !== key);
    return withMarks(x[0], on ? rest : [...rest, [key]]);
  });
  return normalize([...slice(segs, 0, a, titleOf), ...mid, ...slice(segs, b, len, titleOf)]);
}

export function insertMention(segs: Seg[], at: number, pageId: string, titleOf: TitleOf): Seg[] {
  const len = plainOf(segs, titleOf).length;
  const pos = Math.max(0, Math.min(at, len));
  return normalize([...slice(segs, 0, pos, titleOf), ['‣', [['p', pageId]]], [' '], ...slice(segs, pos, len, titleOf)]);
}

function range(segs: Seg[], from: number, to: number, titleOf: TitleOf): [number, number] {
  const len = plainOf(segs, titleOf).length;
  const a = Math.max(0, Math.min(from, to, len));
  const b = Math.min(len, Math.max(from, to));
  return a === b ? [0, len] : [a, b];
}
