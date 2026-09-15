/**
 * What a database view shows, computed the way the web computes it. Filters, sorts and seeded values are ports of
 * apps/web/lib/space/db-filter.ts and db-sort.ts (the phone cannot import from apps/web), chart counts of main.js
 * `chartSeries`, and the date property fallbacks of main.js `datePropOf`. Keep them in step with those files.
 */
import type { NxIconName } from '../NxIcon';
import type { Database, DbRow, DbView, Schema, SchemaProp, SelectOption, ViewType } from '@/api/database';

// ── Filters (db-filter.ts) ──────────────────────────────────────────────────────────────────────────────────────────
type ViewFilter = { id: string; pid: string; op: string; value?: unknown };
const TEXT = ['title', 'text', 'url', 'email', 'phone_number'];
const CHOICE = ['select', 'status'];
const MANY = ['multi_select', 'person'];
const DATE = ['date', 'created_time', 'last_edited_time'];
const NUMBER = ['number', 'auto_increment_id'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function operatorsFor(type: string): string[] {
  if (TEXT.includes(type)) return ['is', 'is_not', 'contains', 'does_not_contain', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
  if (NUMBER.includes(type)) return ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'is_not_empty'];
  if (CHOICE.includes(type)) return ['is', 'is_not', 'is_empty', 'is_not_empty'];
  if (MANY.includes(type)) return ['contains', 'does_not_contain', 'is_empty', 'is_not_empty'];
  if (DATE.includes(type)) return ['is', 'before', 'after', 'on_or_before', 'on_or_after', 'is_empty', 'is_not_empty'];
  if (type === 'checkbox') return ['is'];
  if (type === 'files') return ['is_empty', 'is_not_empty'];
  return [];
}
const needsValue = (op: string) => op !== 'is_empty' && op !== 'is_not_empty';
export const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function filterReady(f: ViewFilter, prop: SchemaProp | undefined): boolean {
  if (!prop || !operatorsFor(prop.type).includes(f.op)) return false;
  if (!needsValue(f.op)) return true;
  const v = f.value;
  if (prop.type === 'checkbox') return typeof v === 'boolean';
  if (CHOICE.includes(prop.type) || MANY.includes(prop.type)) return Array.isArray(v) && v.length > 0;
  if (NUMBER.includes(prop.type)) return typeof v !== 'boolean' && !blank(v) && Number.isFinite(Number(v));
  if (DATE.includes(prop.type)) return typeof v === 'string' && DAY.test(v);
  return typeof v === 'string' && v.trim() !== '';
}

function cell(row: DbRow, pid: string, prop: SchemaProp): unknown {
  if (prop.type === 'title') return row[pid] ?? row.title;
  if (prop.type === 'created_time') return row.created;
  if (prop.type === 'last_edited_time') return row.edited ?? row.created;
  return row[pid];
}

function matchesFilter(row: DbRow, f: ViewFilter, prop: SchemaProp): boolean {
  const t = prop.type;
  const v = cell(row, f.pid, prop);
  if (t === 'checkbox') return Boolean(v) === (f.value === true);
  if (f.op === 'is_empty') return blank(v);
  if (f.op === 'is_not_empty') return !blank(v);
  if (TEXT.includes(t)) {
    const have = String(v ?? '').trim().toLowerCase();
    const want = String(f.value ?? '').trim().toLowerCase();
    if (f.op === 'is') return have === want;
    if (f.op === 'is_not') return have !== want;
    if (f.op === 'contains') return have.includes(want);
    if (f.op === 'does_not_contain') return !have.includes(want);
    if (f.op === 'starts_with') return have.startsWith(want);
    return have.endsWith(want);
  }
  if (NUMBER.includes(t)) {
    if (blank(v) || !Number.isFinite(Number(v))) return f.op === 'ne';
    const a = Number(v);
    const b = Number(f.value);
    if (f.op === 'eq') return a === b;
    if (f.op === 'ne') return a !== b;
    if (f.op === 'gt') return a > b;
    if (f.op === 'lt') return a < b;
    if (f.op === 'gte') return a >= b;
    return a <= b;
  }
  if (CHOICE.includes(t)) {
    const hit = typeof v === 'string' && (f.value as unknown[]).includes(v);
    return f.op === 'is_not' ? !hit : hit;
  }
  if (MANY.includes(t)) {
    const have: unknown[] = Array.isArray(v) ? v : [];
    const hit = (f.value as unknown[]).some((x) => have.includes(x));
    return f.op === 'does_not_contain' ? !hit : hit;
  }
  if (DATE.includes(t)) {
    const day = typeof v === 'number' ? isoDate(new Date(v)) : typeof v === 'string' ? v.slice(0, 10) : '';
    if (!DAY.test(day)) return false;
    const want = String(f.value);
    if (f.op === 'is') return day === want;
    if (f.op === 'before') return day < want;
    if (f.op === 'after') return day > want;
    if (f.op === 'on_or_before') return day <= want;
    return day >= want;
  }
  return true;
}

function filtersOf(view: DbView): ViewFilter[] {
  const raw = view.props.filters;
  return Array.isArray(raw) ? (raw.filter((f) => f && typeof f === 'object' && typeof (f as ViewFilter).pid === 'string') as ViewFilter[]) : [];
}

/** Values for a row made while filters are on, so it lands inside the view it was made in. */
export function seedFromFilters(view: DbView, schema: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of filtersOf(view)) {
    const prop = schema[f.pid];
    if (!prop || !filterReady(f, prop) || !needsValue(f.op)) continue;
    const t = prop.type;
    if (t === 'checkbox') out[f.pid] = f.value === true;
    else if (CHOICE.includes(t) && f.op === 'is') out[f.pid] = (f.value as unknown[])[0];
    else if (MANY.includes(t) && f.op === 'contains') out[f.pid] = [(f.value as unknown[])[0]];
    else if (t !== 'title' && TEXT.includes(t) && ['is', 'contains', 'starts_with', 'ends_with'].includes(f.op)) out[f.pid] = String(f.value).trim();
    else if (t === 'number' && ['eq', 'gte', 'lte'].includes(f.op)) out[f.pid] = Number(f.value);
    else if (t === 'date' && ['is', 'on_or_before', 'on_or_after'].includes(f.op)) out[f.pid] = String(f.value);
  }
  return out;
}

// ── Sorts (db-sort.ts) ──────────────────────────────────────────────────────────────────────────────────────────────
type ViewSort = { pid: string; dir: 'asc' | 'desc' };

function sortsOf(view: DbView): ViewSort[] {
  const s = view.props.sorts;
  if (Array.isArray(s)) {
    return s
      .filter((x): x is { pid: string; dir?: unknown } => !!x && typeof x === 'object' && typeof (x as { pid?: unknown }).pid === 'string')
      .map((x) => ({ pid: x.pid, dir: x.dir === 'desc' ? 'desc' : 'asc' }));
  }
  const one = view.props.sort as { pid?: unknown; dir?: unknown } | undefined;
  return one && typeof one.pid === 'string' ? [{ pid: one.pid, dir: one.dir === 'desc' ? 'desc' : 'asc' }] : [];
}

function optionIndex(prop: SchemaProp, value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const i = (prop.options ?? []).findIndex((o) => o.value === value);
  return i < 0 ? (prop.options ?? []).length : i;
}

function sortKey(row: DbRow, pid: string, prop: SchemaProp): number | string | null {
  const t = prop.type;
  const v = t === 'title' ? (row[pid] ?? row.title) : t === 'created_time' ? row.created : t === 'last_edited_time' ? (row.edited ?? row.created) : row[pid];
  if (t === 'number' || t === 'auto_increment_id') return v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  if (t === 'checkbox') return v ? 1 : 0;
  if (t === 'created_time' || t === 'last_edited_time') return typeof v === 'number' ? v : null;
  if (t === 'select' || t === 'status') return optionIndex(prop, v);
  if (t === 'multi_select') return optionIndex(prop, Array.isArray(v) ? v[0] : undefined);
  if (t === 'date') return typeof v === 'string' && v ? v : null;
  if (t === 'files') {
    const first = Array.isArray(v) ? (v[0] as { name?: unknown } | undefined) : undefined;
    return first && typeof first.name === 'string' && first.name ? first.name : null;
  }
  const text = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  return text.trim() ? text : null;
}

const compare = (a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

/** The rows a view shows: every ready filter holds, then its sorts, blanks last, ties in database order. */
export function viewRows(db: Database, view: DbView): DbRow[] {
  const live = filtersOf(view).filter((f) => filterReady(f, db.schema[f.pid]));
  const kept = live.length ? db.rows.filter((r) => live.every((f) => matchesFilter(r, f, db.schema[f.pid]!))) : db.rows.slice();
  const sorts = sortsOf(view).filter((s) => db.schema[s.pid]);
  if (!sorts.length) return kept;
  const keyed = kept.map((row, index) => ({ row, index, keys: sorts.map((s) => sortKey(row, s.pid, db.schema[s.pid]!)) }));
  keyed.sort((x, y) => {
    for (let i = 0; i < sorts.length; i++) {
      const a = x.keys[i]!;
      const b = y.keys[i]!;
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = compare(a, b);
      if (c !== 0) return sorts[i]!.dir === 'desc' ? -c : c;
    }
    return x.index - y.index;
  });
  return keyed.map((k) => k.row);
}

// ── Columns and properties ─────────────────────────────────────────────────────────────────────────────────────────
export type Column = { pid: string; prop: SchemaProp; width: number };

/** A view's visible columns in its order; the title first when the view has no column list yet. */
export function columnsOf(db: Database, view: DbView): Column[] {
  const format = view.props.format as { table_properties?: { property?: string; visible?: boolean }[] } | undefined;
  const list = Array.isArray(format?.table_properties) ? format!.table_properties! : null;
  const keys = list
    ? list.filter((c) => c && typeof c.property === 'string' && c.visible !== false && db.schema[c.property]).map((c) => c.property!)
    : Object.keys(db.schema).sort((a, b) => (db.schema[a]!.type === 'title' ? -1 : db.schema[b]!.type === 'title' ? 1 : 0));
  if (!keys.some((k) => db.schema[k]!.type === 'title')) {
    const t = titleKey(db.schema);
    if (t) keys.unshift(t);
  }
  return keys.map((pid) => ({ pid, prop: db.schema[pid]!, width: widthFor(db.schema[pid]!.type) }));
}

export function titleKey(schema: Schema): string | undefined {
  return Object.keys(schema).find((k) => schema[k]!.type === 'title');
}

function widthFor(type: string): number {
  if (type === 'checkbox') return 88;
  if (type === 'number') return 110;
  if (type === 'date') return 136;
  return 160;
}

/** Types the phone can edit in place; the rest (people, files, formulas, times) are shown but set on the web. */
export const EDITABLE = new Set(['title', 'text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'url', 'email', 'phone_number']);

export const PROP_ICON: Record<string, NxIconName> = {
  title: 'aa',
  text: 'aa',
  number: 'hash',
  select: 'selectprop',
  status: 'selectprop',
  multi_select: 'bullets',
  date: 'calendar',
  checkbox: 'checklist',
  url: 'link',
  email: 'mail',
  phone_number: 'hash',
  person: 'user',
  files: 'clip',
  created_time: 'clock',
  last_edited_time: 'clock',
};

/** Property types the phone can add, in menu order. */
export const NEW_PROP_TYPES: { type: string; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
];

/** A cell's value as short text. Empty string when blank. */
export function valueText(prop: SchemaProp, v: unknown, row?: DbRow): string {
  switch (prop.type) {
    case 'title':
      return String(v ?? row?.title ?? '');
    case 'date':
      return typeof v === 'string' ? fmtDate(v) : '';
    case 'checkbox':
      return v ? 'Yes' : 'No';
    case 'number':
      return typeof v === 'number' ? (prop.number_format === 'number_with_commas' || prop.number_format === 'dollar' ? commas(v, prop.number_format === 'dollar') : String(v)) : '';
    case 'multi_select':
      return Array.isArray(v) ? v.join(', ') : '';
    case 'person':
      return Array.isArray(v) && v.length ? `${v.length} ${v.length === 1 ? 'person' : 'people'}` : '';
    case 'files':
      return Array.isArray(v) ? v.map((f) => (f && typeof f === 'object' && typeof (f as { name?: unknown }).name === 'string' ? (f as { name: string }).name : 'File')).join(', ') : '';
    case 'created_time':
      return row?.created ? fmtDate(isoDate(new Date(row.created))) : '';
    case 'last_edited_time':
      return row?.edited ? fmtDate(isoDate(new Date(row.edited))) : '';
    default:
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  }
}

function commas(n: number, dollar: boolean): string {
  const [i, d] = Math.abs(n).toFixed(dollar ? 2 : Number.isInteger(n) ? 0 : 2).split('.');
  const s = i!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${dollar ? '$' : ''}${s}${d ? `.${d}` : ''}`;
}

export function optionOf(prop: SchemaProp, value: unknown): SelectOption | undefined {
  return typeof value === 'string' ? (prop.options ?? []).find((o) => o.value === value) : undefined;
}

export const OPT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

const PALETTE: Record<string, { bg: string; fg: string; dot: string }> = {
  default: { bg: 'rgba(84,72,49,0.08)', fg: '#5a5955', dot: '#91918e' },
  gray: { bg: 'rgba(84,72,49,0.08)', fg: '#5a5955', dot: '#91918e' },
  brown: { bg: 'rgba(210,162,141,0.28)', fg: '#7c4a33', dot: '#a27763' },
  orange: { bg: 'rgba(224,124,57,0.18)', fg: '#984c10', dot: '#d9730d' },
  yellow: { bg: 'rgba(236,191,66,0.26)', fg: '#7c5d0b', dot: '#cb912f' },
  green: { bg: 'rgba(123,183,129,0.24)', fg: '#2d6a42', dot: '#448361' },
  blue: { bg: 'rgba(93,165,206,0.22)', fg: '#1d5a85', dot: '#337ea9' },
  purple: { bg: 'rgba(168,129,197,0.22)', fg: '#633a88', dot: '#9065b0' },
  pink: { bg: 'rgba(225,136,179,0.24)', fg: '#88305d', dot: '#c14c8a' },
  red: { bg: 'rgba(244,171,159,0.32)', fg: '#962c2a', dot: '#d44c47' },
};

export function optionColor(color: string | undefined, dark: boolean): { bg: string; fg: string; dot: string } {
  const p = PALETTE[color ?? 'default'] ?? PALETTE.default!;
  return dark ? { bg: p.bg.replace(/[\d.]+\)$/, '0.22)'), fg: p.dot, dot: p.dot } : p;
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}
export function fmtDate(iso: string): string {
  if (!DAY.test(iso.slice(0, 10))) return iso;
  const d = parseIso(iso);
  return `${MONTHS[d.getMonth()]!.slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}
export function shiftIso(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
export function dayDiff(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);
}
/** Six weeks of days covering the month, Sunday first (the web's date picker and calendar grid). */
export function monthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - first.getDay() + i, 12));
}

/** The date property a calendar or timeline reads: its own choice, else the first date property (main.js datePropOf). */
export function datePropOf(view: DbView, schema: Schema): string | undefined {
  const k = (view.type === 'calendar' ? view.props.calendar_by : view.props.timeline_by) ?? view.props.timeline_by ?? view.props.calendar_by;
  return typeof k === 'string' && schema[k] ? k : Object.keys(schema).find((x) => schema[x]!.type === 'date');
}

export function keysOfType(schema: Schema, types: string[]): string[] {
  return Object.keys(schema).filter((k) => types.includes(schema[k]!.type));
}

// ── Chart (main.js chartProp / chartSeries) ────────────────────────────────────────────────────────────────────────
export function chartProp(db: Database, view: DbView): string | undefined {
  const x = view.props.chartX;
  if (typeof x === 'string' && db.schema[x]) return x;
  const keys = Object.keys(db.schema);
  return keys.find((k) => db.schema[k]!.type === 'multi_select') ?? keys.find((k) => db.schema[k]!.type === 'select') ?? keys.find((k) => db.schema[k]!.type === 'status');
}

export type ChartCat = { name: string; n: number; color?: string; none?: boolean };

export function chartSeries(db: Database, view: DbView, rows: DbRow[]): { pid?: string; cats: ChartCat[] } {
  const pid = chartProp(db, view);
  if (!pid) return { cats: [] };
  const prop = db.schema[pid]!;
  const counts = new Map((prop.options ?? []).map((o) => [o.value, 0]));
  let none = 0;
  for (const r of rows) {
    const v = r[pid];
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    if (!vals.length) none++;
    for (const x of vals) if (typeof x === 'string') counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  let cats: ChartCat[] = [...counts.entries()].map(([name, n]) => ({ name, n, color: optionOf(prop, name)?.color }));
  cats.push({ name: `No ${prop.name}`, n: none, none: true });
  if (view.props.chartSort === 'desc') cats.sort((a, b) => b.n - a.n);
  else if (view.props.chartSort === 'asc') cats.sort((a, b) => a.n - b.n);
  if (view.props.omitZero) cats = cats.filter((c) => c.n > 0);
  return { pid, cats };
}

// ── View types ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** The nine view types in the owner's grid order (Table, Board, Timeline / Calendar, List, Gallery / Chart, Feed, Map). */
export const VIEW_TYPES: { type: ViewType; label: string; icon: NxIconName }[] = [
  { type: 'table', label: 'Table', icon: 'table' },
  { type: 'board', label: 'Board', icon: 'board' },
  { type: 'timeline', label: 'Timeline', icon: 'timeline' },
  { type: 'calendar', label: 'Calendar', icon: 'calendar' },
  { type: 'list', label: 'List', icon: 'bullets' },
  { type: 'gallery', label: 'Gallery', icon: 'gallery' },
  { type: 'chart', label: 'Chart', icon: 'chart' },
  { type: 'feed', label: 'Feed', icon: 'feed' },
  { type: 'map', label: 'Map', icon: 'pin' },
];

export function viewIcon(type: ViewType): NxIconName {
  return VIEW_TYPES.find((v) => v.type === type)?.icon ?? 'table';
}

export function viewName(view: DbView): string {
  const n = view.props.name;
  return typeof n === 'string' && n.trim() ? n : VIEW_TYPES.find((v) => v.type === view.type)?.label ?? 'View';
}
