/**
 * Databases on the phone, in the exact record shapes the web's Space app writes (apps/web/space/app/main.js,
 * apps/web/lib/space/records.ts). Every write goes through `ws_apply`, lists as operations (list-ops.ts).
 *
 * How the web stores a database:
 * - The database is a PAGE record of type `database`: props `{ title, description, hideDescription, collection, views[], icon }`.
 *   In a note it is a sub-page linked from the note by an ordinary `page` block (`{ pageId }`); the web has no inline
 *   database block, so the phone draws that linked page inline and the web shows it as a page link.
 * - Its COLLECTION record (parent: the database page) holds one field per property, `s:<property id>` =
 *   `{ name, type, options? }` (never one `schema` object, so two people adding columns do not erase each other),
 *   and the ordered `rows` list.
 * - Each ROW record (parent: the collection) holds `title` and one field per property id. Dates are `YYYY-MM-DD`,
 *   a timeline's end date is `<property id>_end`, a select is the option's value, a multi-select an array of values.
 * - Each VIEW record (parent: the database page, listed in the page's `views`) has the view type as its record type
 *   and props `{ name, format: { table_properties: [{ property, visible, width }] }, group_by, calendar_by,
 *   timeline_by, chartX, chartType, filters, sorts, loadLimit, … }`.
 * - A row opens as a page whose id is derived from the row's (rowPageId), type `page`, parent the database page,
 *   props `{ title, content: [], icon: null, rowOf: { coll, row } }`, made the first time anyone opens it.
 */
import { loadPage, pageBlocks, type LoadedPage, type SpaceRecord } from './space';
import { newId, type ApplyResult } from './spaceWrite';
import { supabase } from './supabase';

export type PropType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'person'
  | 'files'
  | 'created_time'
  | 'last_edited_time'
  | 'auto_increment_id'
  | 'formula'
  | string;

export type SelectOption = { id?: string; value: string; color?: string };
export type SchemaProp = { name: string; type: PropType; options?: SelectOption[]; number_format?: string; [k: string]: unknown };
export type Schema = Record<string, SchemaProp>;

/** A row as the views read it: the web's row object (title, a value per property id, created/edited in ms). */
export type DbRow = { id: string; title: string; created?: number; edited?: number; [pid: string]: unknown };

export type ViewType = 'table' | 'board' | 'timeline' | 'calendar' | 'list' | 'gallery' | 'chart' | 'feed' | 'map' | string;
export type DbView = { id: string; type: ViewType; props: Record<string, unknown> };

export type Database = {
  pageId: string;
  title: string;
  collectionId: string;
  schema: Schema;
  rows: DbRow[];
  views: DbView[];
  /** The page's `views` list and the collection's `rows` list as stored, for list anchors. */
  viewIds: string[];
  rowIds: string[];
  role: string;
};

type Op =
  | { op: 'create'; id: string; kind: SpaceRecord['kind']; type: string; parent_id: string | null; props: Record<string, unknown> }
  | { op: 'update'; id: string; type?: string; set?: Record<string, unknown>; lists?: Record<string, { ins?: [string, string | null][]; del?: string[] }> }
  | { op: 'destroy'; id: string };

async function apply(spaceId: string, ops: Op[]): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc('ws_apply', { p_space: spaceId, p_ops: ops, p_client: 'ios' });
  if (error) throw new Error(`ws_apply: ${error.message}`);
  const res = data as Partial<ApplyResult>;
  const out: ApplyResult = { results: res.results ?? [], conflicts: res.conflicts ?? [], denied: res.denied ?? [] };
  if (out.denied.length) throw new Error('You do not have permission to change this database.');
  return out;
}

const SCHEMA_PREFIX = 's:';
const ms = (iso: unknown) => (typeof iso === 'string' ? Date.parse(iso) : undefined);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The web's property id: four base-36 characters (main.js `propId`). */
export function propId(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
}

/**
 * The page a row opens as (main.js `rowPageId`): the row id with its last 12 hex digits XORed with 5a5a5a5a5a5a.
 * Done in two 24-bit halves so it needs no BigInt.
 */
export function rowPageId(rowId: string): string {
  const tail = rowId.slice(24);
  const a = (parseInt(tail.slice(0, 6), 16) ^ 0x5a5a5a).toString(16).padStart(6, '0');
  const b = (parseInt(tail.slice(6, 12), 16) ^ 0x5a5a5a).toString(16).padStart(6, '0');
  return rowId.slice(0, 24) + a + b;
}

/** Page ids among a loaded page's sub-pages that are databases (their summary carries `collection`). */
export function databasePageIdsOf(loaded: LoadedPage | undefined): Set<string> {
  const out = new Set<string>();
  for (const ch of loaded?.children ?? []) {
    const props = ch.props as Record<string, unknown>;
    if (ch.alive && typeof props.collection === 'string') out.add(ch.id);
  }
  return out;
}

export function isDatabasePage(loaded: LoadedPage | undefined): boolean {
  return !!loaded && loaded.page.type === 'database' && typeof loaded.page.props.collection === 'string';
}

/** Reads a loaded database page into its schema, ordered rows and ordered views. Null when it is not a database. */
export function databaseFrom(loaded: LoadedPage): Database | null {
  const page = loaded.page;
  const cid = page.props.collection;
  if (typeof cid !== 'string') return null;
  const all = [page, ...loaded.records];
  const coll = all.find((r) => r.kind === 'collection' && r.id === cid);
  const schema: Schema = {};
  if (coll) {
    for (const [k, v] of Object.entries(coll.props)) {
      if (k.startsWith(SCHEMA_PREFIX) && v && typeof v === 'object') schema[k.slice(SCHEMA_PREFIX.length)] = v as SchemaProp;
    }
  }
  if (!Object.values(schema).some((p) => p.type === 'title')) schema.title = { name: 'Name', type: 'title' };

  const rowIds = strList(coll?.props.rows);
  const at = new Map(rowIds.map((id, i) => [id, i]));
  const rows = all
    .filter((r) => r.kind === 'row' && r.parent_id === cid && r.alive !== false)
    .map((r) => {
      const meta = r as SpaceRecord & { created_at?: string };
      return { ...r.props, id: r.id, title: typeof r.props.title === 'string' ? r.props.title : '', created: ms(meta.created_at), edited: ms(r.edited_at) } as DbRow;
    })
    .sort((a, b) => (at.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (at.get(b.id) ?? Number.MAX_SAFE_INTEGER));

  const viewIds = strList(page.props.views);
  const byId = new Map(all.filter((r) => r.kind === 'view').map((r) => [r.id, r]));
  const views = viewIds.map((id) => byId.get(id)).filter((r): r is SpaceRecord => !!r).map((r) => ({ id: r.id, type: r.type || 'table', props: r.props }));

  return { pageId: page.id, title: typeof page.props.title === 'string' ? page.props.title : '', collectionId: cid, schema, rows, views, viewIds, rowIds, role: loaded.role };
}

export function loadDatabase(pageId: string): Promise<LoadedPage> {
  return loadPage(pageId);
}

// ── Creating a database ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A new database inside a note: the database page with a Name, Tags, Date and Done schema, one Table view and three
 * empty rows, linked from the note by a `page` block placed after `afterBlockId` (end of the page when null).
 * `afterParentId` is that block's parent when it sits inside another block; omit it for top-level blocks.
 * Returns the database page's id.
 */
export async function createDatabase(
  spaceId: string,
  pageId: string,
  pageContent: string[],
  afterBlockId: string | null,
  afterParentId?: string | null,
): Promise<string> {
  const dbId = newId();
  const cid = newId();
  const vid = newId();
  const linkId = newId();
  const tags = propId();
  let date = propId();
  while (date === tags) date = propId();
  let done = propId();
  while (done === tags || done === date) done = propId();
  const rows = [newId(), newId(), newId()];
  const parent = afterParentId && afterParentId !== pageId ? afterParentId : pageId;
  const listField = parent === pageId ? 'content' : 'children';
  const anchor = afterBlockId ?? (pageContent.length ? pageContent[pageContent.length - 1]! : null);

  await apply(spaceId, [
    {
      op: 'create',
      id: dbId,
      kind: 'page',
      type: 'database',
      parent_id: pageId,
      props: { title: '', description: '', hideDescription: true, collection: cid, views: [vid], icon: null },
    },
    {
      op: 'create',
      id: cid,
      kind: 'collection',
      type: '',
      parent_id: dbId,
      props: {
        [`${SCHEMA_PREFIX}title`]: { name: 'Name', type: 'title' },
        [`${SCHEMA_PREFIX}${tags}`]: { name: 'Tags', type: 'multi_select', options: [] },
        [`${SCHEMA_PREFIX}${date}`]: { name: 'Date', type: 'date' },
        [`${SCHEMA_PREFIX}${done}`]: { name: 'Done', type: 'checkbox' },
        rows,
      },
    },
    {
      op: 'create',
      id: vid,
      kind: 'view',
      type: 'table',
      parent_id: dbId,
      props: {
        name: 'Table',
        format: {
          table_properties: [
            { property: 'title', visible: true, width: 280 },
            { property: tags, visible: true, width: 200 },
            { property: date, visible: true, width: 200 },
            { property: done, visible: true, width: 120 },
          ],
        },
      },
    },
    ...rows.map((id): Op => ({ op: 'create', id, kind: 'row', type: '', parent_id: cid, props: { title: '' } })),
    { op: 'create', id: linkId, kind: 'block', type: 'page', parent_id: parent, props: { pageId: dbId, title: [] } },
    { op: 'update', id: parent, lists: { [listField]: { ins: [[linkId, anchor]] } } },
  ]);
  return dbId;
}

// ── Rows ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A new row with `values`, placed after `afterRowId` (null puts it first, like the web's New button). Returns its id. */
export async function addRow(spaceId: string, collectionId: string, values: Record<string, unknown>, afterRowId: string | null, id: string = newId()): Promise<string> {
  const props: Record<string, unknown> = { title: '' };
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null) props[k] = v;
  await apply(spaceId, [
    { op: 'create', id, kind: 'row', type: '', parent_id: collectionId, props },
    { op: 'update', id: collectionId, lists: { rows: { ins: [[id, afterRowId]] } } },
  ]);
  return id;
}

/** Sets row fields; `undefined` or `null` clears one (ws_apply removes a field set to null). */
export async function setRowValues(spaceId: string, rowId: string, values: Record<string, unknown>): Promise<void> {
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) set[k] = v === undefined ? null : v;
  await apply(spaceId, [{ op: 'update', id: rowId, set }]);
}

export async function deleteRow(spaceId: string, collectionId: string, rowId: string): Promise<void> {
  await apply(spaceId, [
    { op: 'update', id: collectionId, lists: { rows: { del: [rowId] } } },
    { op: 'destroy', id: rowId },
  ]);
}

/**
 * Makes sure the row's page exists, then returns its id. A create for an id that already exists is a no-op on the
 * server (it answers `existed`), so this is safe to call every time a row is opened.
 */
export async function ensureRowPage(spaceId: string, db: Pick<Database, 'pageId' | 'collectionId'>, row: Pick<DbRow, 'id' | 'title'>): Promise<string> {
  const pid = rowPageId(row.id);
  await apply(spaceId, [
    {
      op: 'create',
      id: pid,
      kind: 'page',
      type: 'page',
      parent_id: db.pageId,
      props: { title: row.title || '', icon: null, content: [], rowOf: { coll: db.collectionId, row: row.id } },
    },
  ]);
  return pid;
}

/** The first few lines of each row's page, for the Feed view. Rows whose page was never made have none. */
export async function rowPageLines(rowId: string, max = 3): Promise<string[]> {
  try {
    const loaded = await loadPage(rowPageId(rowId));
    return pageBlocks(loaded)
      .map((b) => b.text.trim())
      .filter(Boolean)
      .slice(0, max);
  } catch {
    return [];
  }
}

// ── Schema ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Replaces one property's definition (its name, type or options). One field per property, as the web syncs it. */
export async function setSchemaProp(spaceId: string, collectionId: string, pid: string, prop: SchemaProp): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: collectionId, set: { [SCHEMA_PREFIX + pid]: prop } }]);
}

/** A new property, shown as a column in `view` (when given) the way the web's column menu adds one. Returns its id. */
export async function addProperty(spaceId: string, collectionId: string, prop: SchemaProp, schema: Schema, view?: DbView, pid: string = freePropId(schema)): Promise<string> {
  const ops: Op[] = [{ op: 'update', id: collectionId, set: { [SCHEMA_PREFIX + pid]: prop } }];
  if (view && view.id) ops.push({ op: 'update', id: view.id, set: { format: formatWithColumn(view, schema, pid) } });
  await apply(spaceId, ops);
  return pid;
}

export function freePropId(schema: Schema): string {
  let pid = propId();
  while (schema[pid]) pid = propId();
  return pid;
}

/** The view's `format` with `pid` appended as a visible column. */
export function formatWithColumn(view: DbView, schema: Schema, pid: string): Record<string, unknown> {
  const format = (view.props.format && typeof view.props.format === 'object' ? view.props.format : {}) as { table_properties?: unknown[] };
  const cols = Array.isArray(format.table_properties) ? format.table_properties : defaultColumns(schema);
  return { ...format, table_properties: [...cols, { property: pid, visible: true, width: 200 }] };
}

export function defaultColumns(schema: Schema): { property: string; visible: boolean; width: number }[] {
  const keys = Object.keys(schema).sort((a, b) => (schema[a]!.type === 'title' ? -1 : schema[b]!.type === 'title' ? 1 : 0));
  return keys.map((k) => ({ property: k, visible: true, width: schema[k]!.type === 'title' ? 280 : 200 }));
}

// ── Views ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The status property, else the first select (main.js `groupPropOf`). */
export function groupPropOf(schema: Schema): string | undefined {
  const keys = Object.keys(schema);
  return keys.find((k) => schema[k]!.type === 'status') ?? keys.find((k) => schema[k]!.type === 'select');
}

/**
 * A new view after the last one, copied from `base` the way the web's Add view menu does (columns, filters and sorts
 * carry over; a board groups by the status or first select property). Returns its id.
 */
export async function addView(spaceId: string, db: Database, type: ViewType, name: string, base?: DbView, id: string = newId()): Promise<string> {
  const props = newViewProps(db, type, name, base);
  const last = db.viewIds.length ? db.viewIds[db.viewIds.length - 1]! : null;
  await apply(spaceId, [
    { op: 'create', id, kind: 'view', type, parent_id: db.pageId, props },
    { op: 'update', id: db.pageId, lists: { views: { ins: [[id, last]] } } },
  ]);
  return id;
}

/** The props a new view starts with (see addView). */
export function newViewProps(db: Database, type: ViewType, name: string, base?: DbView): Record<string, unknown> {
  const props: Record<string, unknown> = base ? JSON.parse(JSON.stringify(base.props)) : {};
  delete props.sort;
  props.name = name.trim() || 'New view';
  if (!props.format) props.format = { table_properties: defaultColumns(db.schema) };
  if (type === 'board') {
    const own = typeof props.group_by === 'string' && ['select', 'status'].includes(db.schema[props.group_by]?.type ?? '') ? props.group_by : undefined;
    const gp = own ?? groupPropOf(db.schema);
    if (gp) props.group_by = gp;
    else delete props.group_by;
  }
  return props;
}

/** Sets view fields (name, group_by, calendar_by, chartType…); null clears one. */
export async function setViewProps(spaceId: string, viewId: string, set: Record<string, unknown>): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: viewId, set }]);
}

export async function deleteView(spaceId: string, dbPageId: string, viewId: string): Promise<void> {
  await apply(spaceId, [
    { op: 'update', id: dbPageId, lists: { views: { del: [viewId] } } },
    { op: 'destroy', id: viewId },
  ]);
}

export async function setDatabaseTitle(spaceId: string, dbPageId: string, title: string): Promise<void> {
  await apply(spaceId, [{ op: 'update', id: dbPageId, set: { title } }]);
}
