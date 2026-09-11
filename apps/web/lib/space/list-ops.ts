/**
 * Ordered lists of ids (a page's blocks, a block's children, a database's rows, a page's views) travel between
 * the browser and the server as OPERATIONS, never as whole arrays.
 *
 * 🔴 WHY: two people editing one page both change its `content`. Sending arrays means whoever saves second erases
 * the first person's new block. Sending "insert X after Y" and "remove Z" means both survive, in a sensible order,
 * without a conflict ever being raised. `ws_list_apply` in supabase/migrations/20260911T10_space_core.sql is the
 * server half; `applyList` here must stay its exact mirror, and list-ops.test.ts pins the shared cases.
 */

export interface ListOp {
  /** [id, the id it goes after, or null for the front]. Applied in order, so later anchors can be earlier inserts. */
  ins?: Array<[string, string | null]>;
  del?: string[];
}

/**
 * The operation that turns `base` into `local`. Ids that kept their relative order stay put (the longest such run);
 * everything else is inserted after its new left neighbour. Returns null when nothing changed.
 */
export function diffList(base: readonly string[], local: readonly string[]): ListOp | null {
  const localSet = new Set(local);
  const basePos = new Map<string, number>();
  base.forEach((id, i) => {
    if (!basePos.has(id)) basePos.set(id, i);
  });
  const del = base.filter((id, i) => !localSet.has(id) && basePos.get(id) === i);
  const kept = keptInOrder(local, basePos);
  const ins: Array<[string, string | null]> = [];
  const placed = new Set<string>();
  local.forEach((id, i) => {
    if (placed.has(id)) return;
    placed.add(id);
    if (!kept.has(id)) ins.push([id, i === 0 ? null : (local[i - 1] ?? null)]);
  });
  if (!del.length && !ins.length) return null;
  const op: ListOp = {};
  if (del.length) op.del = del;
  if (ins.length) op.ins = ins;
  return op;
}

/** Longest increasing subsequence of base positions, read in local order: the ids that did not move. */
function keptInOrder(local: readonly string[], basePos: Map<string, number>): Set<string> {
  const ids: string[] = [];
  const pos: number[] = [];
  const seen = new Set<string>();
  for (const id of local) {
    const p = basePos.get(id);
    if (p === undefined || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    pos.push(p);
  }
  const tails: number[] = [];
  const prev = new Array<number>(pos.length).fill(-1);
  for (let i = 0; i < pos.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pos[tails[mid]!]! < pos[i]!) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const kept = new Set<string>();
  let k = tails.length ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    kept.add(ids[k]!);
    k = prev[k]!;
  }
  return kept;
}

/** The server's `ws_list_apply`, in TypeScript. An insert whose anchor is gone lands at the end. */
export function applyList(arr: readonly unknown[] | null | undefined, op: ListOp | null | undefined): string[] {
  let out = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  if (op?.del?.length) {
    const gone = new Set(op.del);
    out = out.filter((x) => !gone.has(x));
  }
  for (const [item, after] of op?.ins ?? []) {
    if (item == null) continue;
    out = out.filter((x) => x !== item);
    if (after == null) {
      out.unshift(item);
    } else {
      const at = out.indexOf(after);
      if (at < 0) out.push(item);
      else out.splice(at + 1, 0, item);
    }
  }
  return out;
}

/** What `local` becomes once someone else's `remote` version of the same list lands: my edits, replayed on theirs. */
export function rebaseList(base: readonly string[], local: readonly string[], remote: readonly string[]): string[] {
  return applyList(remote, diffList(base, local));
}
