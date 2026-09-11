/**
 * The Space sync engine: keeps the frontend's state (`S`) and the server's records in step, for several people at once.
 *
 * How it works, in order of what happens when someone types:
 * 1. The UI mutates `S` and calls `schedule()`. It never says what it changed.
 * 2. `flush()` reads `S` into records (records.ts) and compares each with `base`, the last thing the server said.
 *    Differences become operations: create, update (changed fields, list inserts and removals), trash, destroy.
 * 3. `ws_apply` answers per operation, index for index. Fields it accepted become the new base. A field someone else
 *    changed first comes back as a conflict with the server's value: text is merged (text-merge.ts), lists are
 *    replayed (list-ops.ts), anything else keeps this person's value, and the result goes out again.
 * 4. Everyone else's changes arrive as broadcasts (`receive`). A field nobody here touched takes the new value; a
 *    field with an unsent edit is merged the same way as a conflict, so nothing typed here is ever overwritten.
 *
 * 🔴 NOTHING IS QUEUED. The pending work is always "S minus base", recomputed on every flush. Going offline, a
 * failed request or a reload with S restored all resume the same way, and there is no queue to replay twice.
 *
 * 🔴 A RECORD THAT LEAVES MUST TAKE ITS DESCENDANTS FROM S AS WELL. Anything left in S with no base looks brand new
 * to step 2, so a page deleted by someone else would be recreated, block by block, by everyone who had it open.
 */

import { diffList, rebaseList, type ListOp } from "./list-ops";
import {
  clone,
  hasRecord,
  KIND_ORDER,
  LIST_FIELDS,
  normalizeState,
  removeRecord,
  same,
  sectionOf,
  settleDerived,
  TEXT_FIELDS,
  writeRecord,
  type CopyState,
  type Kind,
  type LocalRecord,
  type Props,
  type RecordMeta,
  type Section,
} from "./records";
import { mergeRich, mergeText, type RichText } from "./text-merge";

/**
 * The most operations one write sends. ws_apply refuses more than 2,000 in one call, and an import or a large paste can
 * hold more, so a flush sends them in pieces.
 */
export const MAX_OPS_PER_WRITE = 500;

export interface ServerRecord extends RecordMeta {
  id: string;
  kind: Kind;
  type?: string;
  parent_id?: string | null;
  props?: Props;
  alive?: boolean;
  v: number;
  fv?: Record<string, number>;
  partial?: boolean;
}

export interface Op {
  op: "create" | "update" | "trash" | "restore" | "destroy";
  id: string;
  kind?: Kind;
  type?: string;
  parent_id?: string | null;
  section?: Section;
  props?: Props;
  base?: number;
  bases?: Record<string, number>;
  set?: Props;
  lists?: Record<string, ListOp>;
}

export interface OpResult {
  id: string;
  v?: number;
  existed?: boolean;
  missing?: boolean;
  destroyed?: boolean;
  denied?: boolean;
  lists?: Record<string, string[]>;
}

export interface ApplyResult {
  ok?: boolean;
  results: OpResult[];
  conflicts: Array<{ id: string; field: string; value: unknown; v: number }>;
  denied: string[];
}

export interface TxItem extends Partial<Omit<ServerRecord, "id" | "kind">> {
  id: string;
  kind: Kind;
  set?: Props;
  created?: boolean;
  destroyed?: boolean;
  left?: boolean;
  moved?: boolean;
}

export interface Tx {
  by?: string;
  client?: string | null;
  page?: string;
  records?: TxItem[];
  items?: TxItem[];
  refetch?: boolean;
}

export interface Transport {
  apply(space: string, ops: Op[], client: string): Promise<ApplyResult>;
}

export type SyncStatus = "saved" | "saving" | "offline";

export interface SyncOptions {
  transport: Transport;
  state: () => CopyState;
  changed: () => void;
  client: string;
  space: () => string;
  delayMs?: number;
  personName?: (id: string | null | undefined) => string | undefined;
  onDenied?: (ids: string[]) => void;
  onStatus?: (status: SyncStatus) => void;
  /** A write the server refused outright (not a member any more, bad input): retrying would only repeat it. */
  onFatal?: (error: unknown) => void;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
}

interface Base {
  rec: LocalRecord;
  v: number;
  /** The version at which this browser last knew each field's value ($type, $parent, $alive for the structure). */
  fv: Record<string, number>;
  partial: boolean;
  meta: RecordMeta;
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

function fieldVersions(rec: LocalRecord, v: number): Record<string, number> {
  const out: Record<string, number> = { $type: v, $parent: v, $alive: v };
  for (const k of Object.keys(rec.props)) out[k] = v;
  return out;
}

function pickMeta(r: Partial<ServerRecord>): RecordMeta {
  const meta: RecordMeta = {};
  for (const k of ["page_id", "path", "owner_id", "team_id", "created_by", "created_at", "edited_by", "edited_at", "trashed_at"] as const) {
    if (k in r) (meta as Record<string, unknown>)[k] = (r as Record<string, unknown>)[k];
  }
  return meta;
}

function toLocal(r: ServerRecord): LocalRecord {
  const parent = r.parent_id ?? null;
  return {
    id: r.id,
    kind: r.kind,
    type: r.type ?? "",
    parent_id: parent,
    props: clone(r.props ?? {}),
    alive: r.alive !== false,
    ...(r.kind === "page" && parent === null ? { section: sectionOf(r) } : {}),
  };
}

/** Two versions of one field, reconciled with what this browser last knew. Lists replay, text merges, the rest stays mine. */
export function mergeField(kind: Kind, field: string, baseVal: unknown, localVal: unknown, remoteVal: unknown): unknown {
  if (same(localVal, baseVal)) return clone(remoteVal);
  if (same(localVal, remoteVal)) return localVal;
  if (LIST_FIELDS[kind].includes(field)) return rebaseList(ids(baseVal), ids(localVal), ids(remoteVal));
  const text = TEXT_FIELDS[kind][field];
  if (text === "plain" && typeof localVal === "string" && typeof remoteVal === "string") {
    return mergeText(typeof baseVal === "string" ? baseVal : "", localVal, remoteVal);
  }
  if (text === "rich" && Array.isArray(localVal) && Array.isArray(remoteVal)) {
    return mergeRich(baseVal as RichText, localVal as RichText, remoteVal as RichText);
  }
  return localVal;
}

function orderCreates(recs: LocalRecord[]): LocalRecord[] {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const out: LocalRecord[] = [];
  const seen = new Set<string>();
  const visit = (r: LocalRecord) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) visit(parent);
    out.push(r);
  };
  [...recs].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).forEach(visit);
  return out;
}

export class SpaceSync {
  private base = new Map<string, Base>();
  /**
   * 🔴 IDS THAT HAVE BEEN IN S. A record can be in base without ever reaching S: a comment on a block this browser has
   * not loaded, a row whose database is not open. Its absence from S then means "not here", not "deleted", and only a
   * record that was here and is gone may be destroyed.
   */
  private seen = new Set<string>();
  private flushing: Promise<void> | null = null;
  private again = false;
  private disposed = false;
  private timer: unknown = null;
  private retryDelay = 0;
  status: SyncStatus = "saved";
  lastError: unknown = null;

  constructor(private readonly o: SyncOptions) {}

  known(id: string): boolean {
    return this.base.has(id);
  }

  metaOf(id: string): RecordMeta | undefined {
    return this.base.get(id)?.meta;
  }

  versionOf(id: string): number | undefined {
    return this.base.get(id)?.v;
  }

  /** Records from a load (a page, the sidebar, a search): new ones go into S, known ones merge like broadcasts. */
  ingest(records: ServerRecord[]): void {
    if (!records.length) return;
    const S = this.o.state();
    const local = normalizeState(S, { parentOf: (id) => this.base.get(id)?.rec.parent_id });
    const sorted = [...records].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    for (const r of sorted) this.absorb(S, local, r);
    settleDerived(S);
    this.o.changed();
  }

  /** A broadcast from `ws_apply` (event `tx` on a page channel, or `tree` for the sidebar). Returns "refetch" when the change was too big to carry. */
  receive(tx: Tx): "refetch" | undefined {
    if (tx.client && tx.client === this.o.client) return undefined;
    if (tx.refetch) return "refetch";
    const S = this.o.state();
    const local = normalizeState(S, { parentOf: (id) => this.base.get(id)?.rec.parent_id });
    let touched = false;
    for (const item of [...(tx.records ?? []), ...(tx.items ?? [])]) {
      if (item.destroyed) {
        if (this.base.has(item.id) || local.has(item.id)) {
          this.forget(S, item.id);
          touched = true;
        }
        continue;
      }
      if (item.left) {
        const b = this.base.get(item.id);
        if (b && tx.page && b.meta.page_id === tx.page) {
          this.forget(S, item.id);
          touched = true;
        }
        continue;
      }
      if (item.v === undefined) continue;
      if (!item.set) {
        // A whole record (created) or a page summary (trash, restore, sidebar).
        this.absorb(S, local, item as ServerRecord);
        touched = true;
        continue;
      }
      if (this.applySet(S, local, item)) touched = true;
    }
    if (touched) {
      settleDerived(S);
      this.o.changed();
    }
    return undefined;
  }

  schedule(delay = this.o.delayMs ?? 250): void {
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Send everything that differs from the server, and keep going until nothing does (or the network is gone). */
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    const full = this.diff(this.current());
    if (!full.ops.length) {
      this.setStatus("saved");
      return;
    }
    // Only the first slice goes now. Whatever did not fit is still different from the base, so the next diff, right
    // after this one lands, picks it up; creates stay parents first across the slices.
    const batch = full.ops.length > MAX_OPS_PER_WRITE ? { ops: full.ops.slice(0, MAX_OPS_PER_WRITE), snaps: full.snaps } : full;
    this.setStatus("saving");
    let failed = false;
    this.flushing = (async () => {
      try {
        const res = await this.o.transport.apply(this.o.space(), batch.ops, this.o.client);
        this.retryDelay = 0;
        this.lastError = null;
        if (this.ack(res, batch) || batch !== full) this.again = true;
      } catch (err) {
        failed = true;
        this.lastError = err;
        this.setStatus("offline");
        if ((err as { retryable?: boolean } | null)?.retryable === false) {
          this.o.onFatal?.(err);
          return;
        }
        this.retryDelay = Math.min(30_000, this.retryDelay ? this.retryDelay * 2 : 1_000);
        this.setTimer(() => void this.flush(), this.retryDelay);
      } finally {
        this.flushing = null;
      }
    })();
    await this.flushing;
    if (failed) return;
    if (this.again) {
      this.again = false;
      await this.flush();
    } else {
      this.setStatus("saved");
    }
  }

  /** True when S holds something the server has not acknowledged. */
  dirty(): boolean {
    return this.diff(this.current()).ops.length > 0;
  }

  /**
   * Resolves true once the server holds everything in S, false when a write failed (its retry is already scheduled) or
   * this engine was retired. flush() is not enough for that: called while a write is out, it hands back that write and
   * returns before whatever was waiting behind it has gone.
   */
  async saved(): Promise<boolean> {
    for (let round = 0; round < 100; round++) {
      if (this.disposed) return false;
      if (this.flushing) {
        await this.flushing;
        continue;
      }
      if (!this.dirty()) return true;
      await this.flush();
      if (this.status === "offline") return false;
    }
    return false;
  }

  /** Retires this engine for good. Switching workspace replaces it, and a retry it scheduled must not write after that. */
  dispose(): void {
    this.disposed = true;
  }

  // ------------------------------------------------------------------------------------------------ internals

  private current(): Map<string, LocalRecord> {
    return normalizeState(this.o.state(), { parentOf: (id) => this.base.get(id)?.rec.parent_id });
  }

  private setTimer(fn: () => void, ms: number): unknown {
    return this.o.timers ? this.o.timers.set(fn, ms) : setTimeout(fn, ms);
  }

  private setStatus(status: SyncStatus) {
    if (this.status === status) return;
    this.status = status;
    this.o.onStatus?.(status);
  }

  private ctx() {
    return { personName: this.o.personName };
  }

  private absorb(S: CopyState, local: Map<string, LocalRecord>, r: ServerRecord) {
    const incoming = toLocal(r);
    const meta = pickMeta(r);
    const b = this.base.get(r.id);
    const mine = local.get(r.id);
    if (!b) {
      this.base.set(r.id, { rec: clone(incoming), v: r.v, fv: fieldVersions(incoming, r.v), partial: !!r.partial, meta });
      // Already in S with no base: this browser made it and the load beat the acknowledgement. S is newer; keep it.
      if (!mine) writeRecord(S, incoming, meta, this.ctx());
      if (mine || hasRecord(S, incoming)) this.seen.add(r.id);
      return;
    }
    b.meta = { ...b.meta, ...meta };
    const fields = new Set([...Object.keys(incoming.props), ...(r.partial ? [] : Object.keys(b.rec.props))]);
    const nextProps: Props = mine ? { ...mine.props } : {};
    for (const f of fields) {
      if ((b.fv[f] ?? 0) >= r.v) continue;
      const remote = incoming.props[f];
      if (mine) {
        const merged = mergeField(r.kind, f, b.rec.props[f], mine.props[f], remote);
        if (merged === undefined) delete nextProps[f];
        else nextProps[f] = merged;
      }
      if (remote === undefined) delete b.rec.props[f];
      else b.rec.props[f] = clone(remote);
      b.fv[f] = r.v;
    }
    const next: LocalRecord = mine ? { ...mine, props: nextProps } : { ...incoming };
    if ("type" in r && (b.fv.$type ?? 0) < r.v) {
      if (mine && mine.type === b.rec.type) next.type = incoming.type;
      b.rec.type = incoming.type;
      b.fv.$type = r.v;
    }
    if ("parent_id" in r && (b.fv.$parent ?? 0) < r.v) {
      if (mine && mine.parent_id === b.rec.parent_id && same(mine.section, b.rec.section)) {
        next.parent_id = incoming.parent_id;
        next.section = incoming.section;
      }
      b.rec.parent_id = incoming.parent_id;
      b.rec.section = incoming.section;
      b.fv.$parent = r.v;
    }
    if ("alive" in r && (b.fv.$alive ?? 0) < r.v) {
      if (mine && mine.alive === b.rec.alive) next.alive = incoming.alive;
      b.rec.alive = incoming.alive;
      b.fv.$alive = r.v;
    }
    b.v = Math.max(b.v, r.v);
    if (!r.partial) b.partial = false;
    if (mine) {
      writeRecord(S, next, b.meta, this.ctx());
      this.seen.add(r.id);
    }
  }

  private applySet(S: CopyState, local: Map<string, LocalRecord>, item: TxItem): boolean {
    const b = this.base.get(item.id);
    const v = item.v ?? 0;
    if (!b) return false;
    const mine = local.get(item.id);
    const next: LocalRecord | null = mine ? { ...mine, props: { ...mine.props } } : null;
    let changed = false;
    for (const [f, raw] of Object.entries(item.set ?? {})) {
      if (f === "$type") continue;
      if ((b.fv[f] ?? 0) >= v) continue;
      const remote = raw === null ? undefined : raw;
      if (next) {
        const merged = mergeField(b.rec.kind, f, b.rec.props[f], mine!.props[f], remote);
        if (merged === undefined) delete next.props[f];
        else next.props[f] = merged;
      }
      if (remote === undefined) delete b.rec.props[f];
      else b.rec.props[f] = clone(remote);
      b.fv[f] = v;
      changed = true;
    }
    if (item.set && "$type" in item.set && (b.fv.$type ?? 0) < v) {
      const type = String(item.set.$type ?? "");
      if (next && mine!.type === b.rec.type) next.type = type;
      b.rec.type = type;
      b.fv.$type = v;
      changed = true;
    }
    const moved = item.moved || (item.partial === true && "parent_id" in item && (item.parent_id ?? null) !== b.rec.parent_id);
    if (moved && (b.fv.$parent ?? 0) < v) {
      const parent = item.parent_id ?? null;
      const section = b.rec.kind === "page" && parent === null ? sectionOf(item) : undefined;
      if (next && mine!.parent_id === b.rec.parent_id) {
        next.parent_id = parent;
        next.section = section;
      }
      b.rec.parent_id = parent;
      b.rec.section = section;
      b.fv.$parent = v;
      changed = true;
    }
    if (item.page_id !== undefined) b.meta.page_id = item.page_id;
    if (item.path !== undefined) b.meta.path = item.path;
    b.v = Math.max(b.v, v);
    if (changed && next) writeRecord(S, next, b.meta, this.ctx());
    return changed;
  }

  /** Remove a record and everything under it from S and from base. */
  private forget(S: CopyState, id: string) {
    const local = normalizeState(S, { parentOf: (id) => this.base.get(id)?.rec.parent_id });
    const parentOf = new Map<string, string | null>();
    for (const [k, r] of local) parentOf.set(k, r.parent_id);
    for (const [k, b] of this.base) if (!parentOf.has(k)) parentOf.set(k, b.rec.parent_id);
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [k, parent] of parentOf) {
        if (!doomed.has(k) && parent && doomed.has(parent)) {
          doomed.add(k);
          grew = true;
        }
      }
    }
    // Comments hang off their parent's arrays, so remove children before parents.
    const order = [...doomed].sort((a, b) => depthOf(b, parentOf) - depthOf(a, parentOf));
    for (const k of order) {
      const rec = local.get(k) ?? this.base.get(k)?.rec;
      if (rec) removeRecord(S, rec);
      this.base.delete(k);
      this.seen.delete(k);
    }
  }

  private diff(current: Map<string, LocalRecord>): { ops: Op[]; snaps: Map<string, LocalRecord> } {
    const creates: LocalRecord[] = [];
    const updates: Op[] = [];
    const alive: Op[] = [];
    const destroys: Op[] = [];
    const snaps = new Map<string, LocalRecord>();
    // 🔴 A LIST ONLY SPEAKS FOR THE IDS THIS BROWSER HAS SEEN. A database row's page loads its collection but only that
    // one row, so S.rows holds one id while the server's `rows` holds all of them. Diffing those raw would send a
    // removal for every row never loaded here, and reorder a shared database into one entry.
    const known = (id: string) => this.base.has(id) || current.has(id);

    for (const rec of current.values()) {
      this.seen.add(rec.id);
      const b = this.base.get(rec.id);
      if (!b) {
        creates.push(rec);
        continue;
      }
      const set: Props = {};
      const bases: Record<string, number> = {};
      const lists: Record<string, ListOp> = {};
      for (const f of new Set([...Object.keys(rec.props), ...Object.keys(b.rec.props)])) {
        const lv = rec.props[f];
        const bv = b.rec.props[f];
        if (same(lv, bv)) continue;
        if (LIST_FIELDS[rec.kind].includes(f)) {
          const op = diffList(ids(bv).filter(known), ids(lv).filter(known));
          if (op) lists[f] = op;
          continue;
        }
        set[f] = lv === undefined ? null : clone(lv);
        bases[f] = b.fv[f] ?? b.v;
      }
      const op: Op = { op: "update", id: rec.id, base: b.v };
      let changed = Object.keys(set).length > 0 || Object.keys(lists).length > 0;
      if (rec.type !== b.rec.type) {
        op.type = rec.type;
        bases.$type = b.fv.$type ?? b.v;
        changed = true;
      }
      const sectionMoved = rec.kind === "page" && rec.parent_id === null && !same(rec.section ?? "private", b.rec.section ?? "private");
      if (rec.parent_id !== b.rec.parent_id || sectionMoved) {
        op.parent_id = rec.parent_id;
        if (rec.kind === "page" && rec.parent_id === null) op.section = rec.section ?? "private";
        changed = true;
      }
      if (changed) {
        if (Object.keys(set).length) op.set = set;
        if (Object.keys(bases).length) op.bases = bases;
        if (Object.keys(lists).length) op.lists = lists;
        updates.push(op);
        snaps.set(rec.id, clone(rec));
      }
      if (rec.kind === "page" && rec.alive !== b.rec.alive) alive.push({ op: rec.alive ? "restore" : "trash", id: rec.id });
    }

    const doomed = new Set<string>();
    for (const id of this.base.keys()) if (!current.has(id) && this.seen.has(id)) doomed.add(id);
    for (const id of doomed) {
      const b = this.base.get(id)!;
      if (b.rec.parent_id && doomed.has(b.rec.parent_id)) continue; // the server takes it along with its parent
      destroys.push({ op: "destroy", id });
    }

    const createOps: Op[] = orderCreates(creates).map((rec) => {
      snaps.set(rec.id, clone(rec));
      const op: Op = { op: "create", id: rec.id, kind: rec.kind, type: rec.type, parent_id: rec.parent_id, props: clone(rec.props) };
      if (rec.kind === "page" && rec.parent_id === null) op.section = rec.section ?? "private";
      return op;
    });
    for (const rec of creates) if (rec.kind === "page" && !rec.alive) alive.push({ op: "trash", id: rec.id });

    return { ops: [...createOps, ...updates, ...alive, ...destroys], snaps };
  }

  /** Returns true when a merge changed S and another flush must follow. */
  private ack(res: ApplyResult, batch: { ops: Op[]; snaps: Map<string, LocalRecord> }): boolean {
    const S = this.o.state();
    const local = normalizeState(S, { parentOf: (id) => this.base.get(id)?.rec.parent_id });
    const conflicts = new Map<string, ApplyResult["conflicts"]>();
    for (const c of res.conflicts ?? []) {
      const list = conflicts.get(c.id) ?? [];
      list.push(c);
      conflicts.set(c.id, list);
    }
    const denied: string[] = [];
    let again = false;
    let touched = false;

    batch.ops.forEach((op, i) => {
      const r = res.results?.[i];
      if (!r || r.id !== op.id) return;
      if (r.denied) {
        denied.push(op.id);
        return;
      }
      if (r.missing) {
        this.forget(S, op.id);
        touched = true;
        return;
      }
      if (op.op === "destroy") {
        this.base.delete(op.id);
        this.seen.delete(op.id);
        return;
      }
      const snap = batch.snaps.get(op.id);
      if (op.op === "create") {
        if (!snap) return;
        const v = r.v ?? 1;
        this.base.set(op.id, { rec: clone(snap), v, fv: fieldVersions(snap, v), partial: false, meta: this.base.get(op.id)?.meta ?? {} });
        return;
      }
      const b = this.base.get(op.id);
      if (!b) return;
      const v = r.v ?? b.v;
      if (op.op === "trash" || op.op === "restore") {
        b.rec.alive = op.op === "restore";
        b.fv.$alive = v;
        b.v = Math.max(b.v, v);
        return;
      }

      const mine = local.get(op.id);
      const next: LocalRecord | null = mine ? { ...mine, props: { ...mine.props } } : null;
      let merged = false;
      const cs = conflicts.get(op.id) ?? [];
      for (const [f, sent] of Object.entries(op.set ?? {})) {
        const c = cs.find((x) => x.field === f);
        if (c) {
          const remote = c.value === null ? undefined : c.value;
          if (next) {
            const value = mergeField(b.rec.kind, f, b.rec.props[f], next.props[f], remote);
            if (!same(value, next.props[f])) merged = true;
            if (value === undefined) delete next.props[f];
            else next.props[f] = value;
          }
          if (remote === undefined) delete b.rec.props[f];
          else b.rec.props[f] = clone(remote);
          b.fv[f] = c.v;
          again = true;
        } else {
          if (sent === null) delete b.rec.props[f];
          else b.rec.props[f] = clone(sent);
          b.fv[f] = v;
        }
      }
      for (const f of Object.keys(op.lists ?? {})) {
        const serverList = r.lists?.[f];
        const sentList = ids(snap?.props[f]);
        if (Array.isArray(serverList)) {
          if (next) {
            const now = ids(next.props[f]);
            const rebased = rebaseList(sentList, now, serverList);
            if (!same(rebased, now)) {
              next.props[f] = rebased;
              merged = true;
            }
          }
          b.rec.props[f] = [...serverList];
        } else {
          b.rec.props[f] = sentList;
        }
        b.fv[f] = v;
      }
      const typeConflict = cs.find((x) => x.field === "$type");
      if (typeConflict) {
        b.rec.type = String(typeConflict.value ?? "");
        b.fv.$type = typeConflict.v;
        again = true;
      } else if (op.type !== undefined) {
        b.rec.type = op.type;
        b.fv.$type = v;
      }
      if ("parent_id" in op) {
        b.rec.parent_id = op.parent_id ?? null;
        b.rec.section = op.section;
        b.fv.$parent = v;
      }
      b.v = Math.max(b.v, v);
      if (merged && next) {
        writeRecord(S, next, b.meta, this.ctx());
        touched = true;
      }
    });

    if (denied.length) {
      for (const id of denied) {
        const b = this.base.get(id);
        if (b) writeRecord(S, clone(b.rec), b.meta, this.ctx());
        else this.forget(S, id);
      }
      touched = true;
      this.o.onDenied?.(denied);
    }
    if (touched) {
      settleDerived(S);
      this.o.changed();
    }
    return again;
  }
}

function depthOf(id: string, parentOf: Map<string, string | null>): number {
  let depth = 0;
  let cur = parentOf.get(id) ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && depth < 1000) {
    seen.add(cur);
    depth++;
    cur = parentOf.get(cur) ?? null;
  }
  return depth;
}
