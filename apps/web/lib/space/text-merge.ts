/**
 * Three-way merge for text two people typed into the same field at once.
 *
 * The server only reports a conflict when one field (a block's text, a page's title) was changed by someone else
 * after the version this browser based its edit on. Last-writer-wins would silently delete their words, so the
 * client merges: what both sides kept stays, what either side deleted goes, what either side inserted is added
 * (mine first when we both typed at the same spot, and once when we typed the same thing).
 *
 * Rich text is the copy's segment array: `[text]` or `[text, decorations]`, where a decoration is `["b"]`,
 * `["a", url]`, `["h", colour]` or a mention (`["p", id]`, `["u", id]`, `["d", date]`). Every character carries
 * its segment's decorations, so making a word bold on one side and typing into it on the other both survive.
 */

export type Decoration = [string, ...unknown[]];
export type Segment = [string] | [string, Decoration[]];
export type RichText = Segment[];

interface Tok {
  ch: string;
  attr: string;
}

const MAX_DIFF_SIZE = 40_000;
const MAX_EDIT_DISTANCE = 4_000;

export function mergeText(base: string, local: string, remote: string): string {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  const toks = (s: string) => Array.from(s, (ch) => ({ ch, attr: "" }));
  return mergeTokens(toks(base), toks(local), toks(remote))
    .map((t) => t.ch)
    .join("");
}

export function mergeRich(base: RichText | null | undefined, local: RichText | null | undefined, remote: RichText | null | undefined): RichText {
  const b = tokenize(base);
  const l = tokenize(local);
  const r = tokenize(remote);
  if (sameToks(l, r) || sameToks(r, b)) return detokenize(l);
  if (sameToks(l, b)) return detokenize(r);
  return detokenize(mergeTokens(b, l, r));
}

export function tokenize(rich: RichText | null | undefined): Tok[] {
  const out: Tok[] = [];
  if (!Array.isArray(rich)) return out;
  for (const seg of rich) {
    if (!Array.isArray(seg) || typeof seg[0] !== "string") continue;
    const decos = seg[1];
    const attr = Array.isArray(decos) && decos.length ? JSON.stringify(decos) : "";
    for (const ch of Array.from(seg[0])) out.push({ ch, attr });
  }
  return out;
}

export function detokenize(toks: Tok[]): RichText {
  const out: RichText = [];
  let text = "";
  let attr: string | null = null;
  const flush = () => {
    if (attr === null || text === "") return;
    out.push(attr ? [text, JSON.parse(attr) as Decoration[]] : [text]);
  };
  for (const t of toks) {
    if (t.attr !== attr) {
      flush();
      text = "";
      attr = t.attr;
    }
    text += t.ch;
  }
  flush();
  return out;
}

function sameToks(a: Tok[], b: Tok[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.ch !== b[i]!.ch || a[i]!.attr !== b[i]!.attr) return false;
  return true;
}

function mergeTokens(base: Tok[], local: Tok[], remote: Tok[]): Tok[] {
  const l = align(base, local);
  const r = align(base, remote);
  if (!l || !r) return local; // too different to merge by character: keep what this person is looking at
  const out: Tok[] = [];
  for (let i = 0; i <= base.length; i++) {
    const il = l.ins[i] ?? [];
    const ir = r.ins[i] ?? [];
    out.push(...il);
    if (!sameToks(il, ir)) out.push(...ir);
    if (i < base.length && l.kept[i] && r.kept[i]) out.push(base[i]!);
  }
  return out;
}

/** For each base position: did the other side keep it, and what did it insert just before it. */
function align(base: Tok[], other: Tok[]): { kept: Uint8Array; ins: Tok[][] } | null {
  const pairs = matchedPairs(base, other);
  if (!pairs) return null;
  const kept = new Uint8Array(base.length);
  const ins: Tok[][] = [];
  let po = 0;
  for (const [bi, oi] of pairs) {
    if (oi > po) ins[bi] = (ins[bi] ?? []).concat(other.slice(po, oi));
    kept[bi] = 1;
    po = oi + 1;
  }
  if (other.length > po) ins[base.length] = (ins[base.length] ?? []).concat(other.slice(po));
  return { kept, ins };
}

/** Myers' O(ND) diff, returning the index pairs of the longest common subsequence. Null when it would be too costly. */
function matchedPairs(a: Tok[], b: Tok[]): Array<[number, number]> | null {
  const eq = (x: Tok, y: Tok) => x.ch === y.ch && x.attr === y.attr;
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n && m) {
    if (n + m > MAX_DIFF_SIZE) return null;
    const max = n + m;
    const off = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace: Int32Array[] = [];
    let found = false;
    for (let d = 0; d <= max && !found; d++) {
      if (d > MAX_EDIT_DISTANCE) return null;
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
        let y = x - k;
        while (x < n && y < m && eq(midA[x]!, midB[y]!)) {
          x++;
          y++;
        }
        v[off + k] = x;
        if (x >= n && y >= m) {
          found = true;
          break;
        }
      }
    }
    const mid: Array<[number, number]> = [];
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0; d--) {
      const vv = trace[d]!;
      const k = x - y;
      const prevK = k === -d || (k !== d && vv[off + k - 1]! < vv[off + k + 1]!) ? k + 1 : k - 1;
      const prevX = vv[off + prevK]!;
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        x--;
        y--;
        mid.push([x + start, y + start]);
      }
      if (d > 0) {
        x = prevX;
        y = prevY;
      }
    }
    mid.reverse();
    pairs.push(...mid);
  }
  for (let i = 0; i < a.length - endA; i++) pairs.push([endA + i, endB + i]);
  return pairs;
}
