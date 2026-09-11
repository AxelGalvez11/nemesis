/**
 * The frontend's state (`S`, the object every Space component reads) and the server's records, mapped both ways.
 *
 * The UI keeps its own shapes: `S.pages`, `S.blocks`, `S.collections`, `S.views`, `S.rows[collectionId]`, and
 * comments living inside the thing they are about. The server keeps one flat list of records (see
 * supabase/migrations/20260911T10_space_core.sql). Nothing in the UI announces what it changed; `normalizeState`
 * reads the whole of `S` into records and the sync engine compares them with what the server last said.
 *
 * 🔴 WRITES GO INTO THE EXISTING OBJECTS, NEVER REPLACE THEM. An editable block's input handler holds the block
 * object it rendered with and assigns `b.title` on every keystroke. Swapping `S.blocks[id]` for a fresh object
 * while someone types would send their next keystrokes into an object nothing reads any more.
 */

export type Kind = "page" | "block" | "row" | "collection" | "view" | "comment";
export type Section = "private" | "workspace" | { team: string };
export type Props = Record<string, unknown>;

export interface LocalRecord {
  id: string;
  kind: Kind;
  type: string;
  parent_id: string | null;
  props: Props;
  alive: boolean;
  /** Only meaningful on a top-level page. */
  section?: Section;
}

export interface RecordMeta {
  page_id?: string | null;
  path?: string[] | null;
  owner_id?: string | null;
  team_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  edited_by?: string | null;
  edited_at?: string | null;
  trashed_at?: string | null;
}

type Obj = Record<string, unknown> & { id: string };
export interface CopyState {
  pages: Record<string, Obj>;
  blocks: Record<string, Obj>;
  collections: Record<string, Obj>;
  views: Record<string, Obj>;
  rows: Record<string, Obj[]>;
  [key: string]: unknown;
}

/** Fields that describe this browser's view of a record, not the record. Keys starting with `_` are always local. */
const LOCAL_ONLY: Record<Kind, readonly string[]> = {
  // `favorite` and `activeView` are one person's: favourites sync through ws_set_favorite, the open view tab stays here.
  page: ["id", "kind", "parent", "trashed", "lastEdited", "comments", "section", "favorite", "favoritedAt", "activeView"],
  // `open` is whether a toggle is expanded for this reader; `tab` which meeting-notes tab they are on.
  block: ["id", "type", "parent", "open", "tab", "comments", "resolvedComments", "edited"],
  row: ["id", "created", "edited", "comments"],
  collection: ["id", "schema"],
  view: ["id", "type"],
  comment: ["id", "author", "authorId", "time", "resolved"],
};

/** Ordered id lists: synced as insert and remove operations (list-ops.ts). */
export const LIST_FIELDS: Record<Kind, readonly string[]> = {
  page: ["content", "views"],
  block: ["children", "notes"],
  row: [],
  collection: ["rows"],
  view: [],
  comment: [],
};

/** Text merged character by character when two people typed at once (text-merge.ts). */
export const TEXT_FIELDS: Record<Kind, Readonly<Record<string, "plain" | "rich">>> = {
  page: { title: "plain", description: "plain" },
  block: { title: "rich" },
  row: { title: "plain" },
  collection: {},
  view: { name: "plain" },
  comment: { text: "plain" },
};

/**
 * 🔴 A DATABASE'S PROPERTIES ARE ONE FIELD EACH (`s:<property id>`), not one `schema` object. Two people adding a
 * column at the same time would otherwise each send the whole schema and the second would erase the first column.
 */
const SCHEMA_PREFIX = "s:";

export const KIND_ORDER: readonly Kind[] = ["page", "collection", "view", "row", "block", "comment"];

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  }) ?? "undefined";
}

export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  return stableJson(a) === stableJson(b);
}

export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function sectionOf(meta: RecordMeta | undefined): Section {
  if (meta?.owner_id) return "private";
  if (meta?.team_id) return { team: meta.team_id };
  return "workspace";
}

function copyProps(obj: Record<string, unknown>, kind: Kind): Props {
  const skip = LOCAL_ONLY[kind];
  const out: Props = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || k.startsWith("_") || skip.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export interface NormalizeHints {
  /** The parent the server last reported, for records whose owner is not in S (a row page brings its database's
   *  collection without the database page). Without it the collection would look deleted. */
  parentOf?: (id: string) => string | null | undefined;
}

/** Every record the UI currently holds, keyed by id. Values are live references; clone before keeping them. */
export function normalizeState(S: CopyState, hints: NormalizeHints = {}): Map<string, LocalRecord> {
  const out = new Map<string, LocalRecord>();
  const comments = (parentId: string, list: unknown, resolved: boolean) => {
    if (!Array.isArray(list)) return;
    for (const c of list as Obj[]) {
      if (!c || typeof c.id !== "string") continue;
      out.set(c.id, { id: c.id, kind: "comment", type: "", parent_id: parentId, props: { ...copyProps(c, "comment"), resolved }, alive: true });
    }
  };

  const pageOfCollection = new Map<string, string>();
  const pageOfView = new Map<string, string>();
  for (const p of Object.values(S.pages ?? {})) {
    if (!p || typeof p.id !== "string" || p.kind === "stub") continue;
    const parent = typeof p.parent === "string" ? p.parent : null;
    out.set(p.id, {
      id: p.id,
      kind: "page",
      type: typeof p.kind === "string" ? p.kind : "page",
      parent_id: parent,
      props: copyProps(p, "page"),
      alive: !p.trashed,
      ...(parent ? {} : { section: (p.section as Section | undefined) ?? "private" }),
    });
    comments(p.id, p.comments, false);
    if (typeof p.collection === "string") pageOfCollection.set(p.collection, p.id);
    if (Array.isArray(p.views)) for (const v of p.views) if (typeof v === "string") pageOfView.set(v, p.id);
  }

  for (const b of Object.values(S.blocks ?? {})) {
    if (!b || typeof b.id !== "string") continue;
    out.set(b.id, {
      id: b.id,
      kind: "block",
      type: typeof b.type === "string" ? b.type : "text",
      parent_id: typeof b.parent === "string" ? b.parent : null,
      props: copyProps(b, "block"),
      alive: true,
    });
    comments(b.id, b.comments, false);
    comments(b.id, b.resolvedComments, true);
  }

  for (const c of Object.values(S.collections ?? {})) {
    if (!c || typeof c.id !== "string") continue;
    const owner = pageOfCollection.get(c.id) ?? hints.parentOf?.(c.id);
    if (!owner) continue;
    const props = copyProps(c, "collection");
    const schema = c.schema;
    if (schema && typeof schema === "object") {
      for (const [k, v] of Object.entries(schema as Record<string, unknown>)) if (v !== undefined) props[SCHEMA_PREFIX + k] = v;
    }
    props.rows = (S.rows?.[c.id] ?? []).filter((r) => r && typeof r.id === "string").map((r) => r.id);
    out.set(c.id, { id: c.id, kind: "collection", type: "", parent_id: owner, props, alive: true });
  }

  for (const v of Object.values(S.views ?? {})) {
    if (!v || typeof v.id !== "string") continue;
    const owner = pageOfView.get(v.id) ?? hints.parentOf?.(v.id);
    if (!owner) continue;
    out.set(v.id, { id: v.id, kind: "view", type: typeof v.type === "string" ? v.type : "table", parent_id: owner, props: copyProps(v, "view"), alive: true });
  }

  for (const [cid, rows] of Object.entries(S.rows ?? {})) {
    if (!out.has(cid) || !Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r.id !== "string") continue;
      out.set(r.id, { id: r.id, kind: "row", type: "", parent_id: cid, props: copyProps(r, "row"), alive: true });
      comments(r.id, r.comments, false);
    }
  }
  return out;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : undefined);

function assignInPlace(target: Record<string, unknown>, next: Props, kind: Kind) {
  const skip = LOCAL_ONLY[kind];
  for (const k of Object.keys(target)) {
    if (k.startsWith("_") || skip.includes(k)) continue;
    if (!(k in next)) delete target[k];
  }
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete target[k];
    else target[k] = clone(v);
  }
}

/** Looks a record's owning entity up in S, wherever that kind lives. */
function findRow(S: CopyState, id: string): { list: Obj[]; index: number } | null {
  for (const list of Object.values(S.rows ?? {})) {
    if (!Array.isArray(list)) continue;
    const index = list.findIndex((r) => r && r.id === id);
    if (index >= 0) return { list, index };
  }
  return null;
}

function entityFor(S: CopyState, id: string | null | undefined): Obj | null {
  if (!id) return null;
  const row = findRow(S, id);
  return S.pages?.[id] ?? S.blocks?.[id] ?? (row ? row.list[row.index] ?? null : null);
}

export interface WriteContext {
  personName?: (id: string | null | undefined) => string | undefined;
}

/**
 * Put a record into S, in place. Comments and row order are rebuilt by the caller once a batch is written
 * (`settleDerived`), so writing a thousand rows is not a thousand sorts.
 */
export function writeRecord(S: CopyState, rec: LocalRecord, meta: RecordMeta = {}, ctx: WriteContext = {}): void {
  const props = rec.props;
  switch (rec.kind) {
    case "page": {
      S.pages ??= {};
      const target = (S.pages[rec.id] ??= { id: rec.id });
      assignInPlace(target, props, "page");
      target.kind = rec.type || "page";
      target.parent = rec.parent_id;
      if (rec.alive) delete target.trashed;
      else target.trashed = ms(meta.trashed_at) ?? (typeof target.trashed === "number" ? target.trashed : Date.now());
      const edited = ms(meta.edited_at);
      if (edited !== undefined) target.lastEdited = edited;
      if (rec.parent_id === null) target.section = rec.section ?? (meta.owner_id !== undefined ? sectionOf(meta) : target.section ?? "private");
      else delete target.section;
      if (!Array.isArray(target.comments)) target.comments = [];
      return;
    }
    case "block": {
      S.blocks ??= {};
      const target = (S.blocks[rec.id] ??= { id: rec.id });
      assignInPlace(target, props, "block");
      target.type = rec.type || "text";
      target.parent = rec.parent_id;
      return;
    }
    case "row": {
      S.rows ??= {};
      const cid = rec.parent_id ?? "";
      const found = findRow(S, rec.id);
      let target: Obj;
      if (found) {
        target = found.list[found.index]!;
        if (found.list !== S.rows[cid]) {
          found.list.splice(found.index, 1);
          (S.rows[cid] ??= []).push(target);
        }
      } else {
        target = { id: rec.id };
        (S.rows[cid] ??= []).push(target);
      }
      assignInPlace(target, props, "row");
      const created = ms(meta.created_at);
      const edited = ms(meta.edited_at);
      if (created !== undefined) target.created = created;
      if (edited !== undefined) target.edited = edited;
      return;
    }
    case "collection": {
      S.collections ??= {};
      const target = (S.collections[rec.id] ??= { id: rec.id });
      const plain: Props = {};
      const schema: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith(SCHEMA_PREFIX)) schema[k.slice(SCHEMA_PREFIX.length)] = v;
        else if (k !== "rows") plain[k] = v;
      }
      assignInPlace(target, plain, "collection");
      const existing = (target.schema && typeof target.schema === "object" ? target.schema : {}) as Record<string, unknown>;
      for (const k of Object.keys(existing)) if (!(k in schema)) delete existing[k];
      for (const [k, v] of Object.entries(schema)) existing[k] = clone(v);
      target.schema = existing;
      S.rows ??= {};
      S.rows[rec.id] ??= [];
      (target as Record<string, unknown>)._rowOrder = Array.isArray(props.rows) ? [...(props.rows as string[])] : [];
      return;
    }
    case "view": {
      S.views ??= {};
      const target = (S.views[rec.id] ??= { id: rec.id });
      assignInPlace(target, props, "view");
      target.type = rec.type || "table";
      return;
    }
    case "comment": {
      const parent = entityFor(S, rec.parent_id);
      if (!parent) return;
      removeCommentFrom(parent, rec.id);
      const listKey = props.resolved ? "resolvedComments" : "comments";
      const list = (Array.isArray(parent[listKey]) ? parent[listKey] : (parent[listKey] = [])) as Obj[];
      const comment: Obj = { id: rec.id };
      for (const [k, v] of Object.entries(props)) if (k !== "resolved" && v !== undefined) comment[k] = clone(v);
      comment.authorId = meta.created_by ?? null;
      comment.author = ctx.personName?.(meta.created_by) ?? comment.author ?? "";
      comment.time = ms(meta.created_at) ?? Date.now();
      list.push(comment);
      return;
    }
  }
}

function removeCommentFrom(parent: Record<string, unknown>, id: string) {
  for (const key of ["comments", "resolvedComments"]) {
    const list = parent[key];
    if (!Array.isArray(list)) continue;
    const i = list.findIndex((c: Obj) => c && c.id === id);
    if (i >= 0) list.splice(i, 1);
  }
}

/** Remove one record from S. Callers remove descendants themselves (they know the tree; S may not). */
export function removeRecord(S: CopyState, rec: Pick<LocalRecord, "id" | "kind" | "parent_id">): void {
  switch (rec.kind) {
    case "page":
      delete S.pages?.[rec.id];
      return;
    case "block":
      delete S.blocks?.[rec.id];
      return;
    case "row": {
      const found = findRow(S, rec.id);
      if (found) found.list.splice(found.index, 1);
      return;
    }
    case "collection":
      delete S.collections?.[rec.id];
      delete S.rows?.[rec.id];
      return;
    case "view":
      delete S.views?.[rec.id];
      return;
    case "comment": {
      const parent = entityFor(S, rec.parent_id);
      if (parent) removeCommentFrom(parent, rec.id);
      return;
    }
  }
}

/** After a batch of writes: rows in their database's order, comments oldest first. */
export function settleDerived(S: CopyState): void {
  for (const c of Object.values(S.collections ?? {})) {
    const order = (c as Record<string, unknown>)._rowOrder;
    const rows = S.rows?.[c.id];
    if (!Array.isArray(order) || !Array.isArray(rows)) continue;
    const at = new Map((order as string[]).map((id, i) => [id, i]));
    rows.sort((a, b) => (at.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (at.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  const byTime = (a: Obj, b: Obj) => Number(a.time ?? 0) - Number(b.time ?? 0);
  const sortComments = (o: Record<string, unknown>) => {
    if (Array.isArray(o.comments)) (o.comments as Obj[]).sort(byTime);
    if (Array.isArray(o.resolvedComments)) (o.resolvedComments as Obj[]).sort(byTime);
  };
  Object.values(S.pages ?? {}).forEach(sortComments);
  Object.values(S.blocks ?? {}).forEach(sortComments);
  Object.values(S.rows ?? {}).forEach((rows) => Array.isArray(rows) && rows.forEach(sortComments));
}

/** Whether a record actually made it into S (a comment needs its parent there, a row its database's list). */
export function hasRecord(S: CopyState, rec: Pick<LocalRecord, "id" | "kind" | "parent_id">): boolean {
  switch (rec.kind) {
    case "page":
      return !!S.pages?.[rec.id];
    case "block":
      return !!S.blocks?.[rec.id];
    case "collection":
      return !!S.collections?.[rec.id];
    case "view":
      return !!S.views?.[rec.id];
    case "row":
      return findRow(S, rec.id) !== null;
    case "comment": {
      const parent = entityFor(S, rec.parent_id);
      if (!parent) return false;
      return ["comments", "resolvedComments"].some((k) => Array.isArray(parent[k]) && (parent[k] as Obj[]).some((c) => c && c.id === rec.id));
    }
  }
}
