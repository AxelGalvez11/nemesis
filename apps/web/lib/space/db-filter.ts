// ── Database filters and in-view search ─────────────────────────────────────────────────────────────────────────────
//
// A view keeps its filters in `filters` ({ id, pid, op, value }), a field of the view record that syncs like any other.
// Every filter must hold. One whose property is gone, whose condition does not fit the property, or whose value is still
// blank is drawn as a chip but not applied, so choosing a property never empties the view before a value is picked.
// Rows are the frontend's objects: the title under the title property's id (`title`), every other property under its
// schema id, and `created` and `edited` in milliseconds.

export type FilterOp =
  | "is"
  | "is_not"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "eq"
  | "ne"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "is_empty"
  | "is_not_empty";

export interface ViewFilter {
  id: string;
  pid: string;
  op: FilterOp;
  value?: unknown;
}

export interface SchemaProp {
  name?: string;
  type: string;
  options?: ReadonlyArray<{ value: string }>;
}

export interface FilterContext {
  /** A time in milliseconds as the viewer's calendar day, YYYY-MM-DD. */
  dayOf?: (ms: number) => string;
}

type Row = { id?: string; title?: unknown; created?: unknown; edited?: unknown; [key: string]: unknown };

const TEXT = ["title", "text", "url", "email", "phone_number"];
const CHOICE = ["select", "status"];
const MANY = ["multi_select", "person"];
const DATE = ["date", "created_time", "last_edited_time"];
const NUMBER = ["number", "auto_increment_id"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const LABELS: Record<FilterOp, string> = {
  is: "Is",
  is_not: "Is not",
  contains: "Contains",
  does_not_contain: "Does not contain",
  starts_with: "Starts with",
  ends_with: "Ends with",
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  before: "Is before",
  after: "Is after",
  on_or_before: "Is on or before",
  on_or_after: "Is on or after",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};

/** The conditions a property type offers, in menu order. Types with none (formulas) cannot be filtered yet. */
export function operatorsFor(type: string): FilterOp[] {
  if (TEXT.includes(type)) return ["is", "is_not", "contains", "does_not_contain", "starts_with", "ends_with", "is_empty", "is_not_empty"];
  if (NUMBER.includes(type)) return ["eq", "ne", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty"];
  if (CHOICE.includes(type)) return ["is", "is_not", "is_empty", "is_not_empty"];
  if (MANY.includes(type)) return ["contains", "does_not_contain", "is_empty", "is_not_empty"];
  if (DATE.includes(type)) return ["is", "before", "after", "on_or_before", "on_or_after", "is_empty", "is_not_empty"];
  if (type === "checkbox") return ["is"];
  return [];
}

export const filterable = (type: string): boolean => operatorsFor(type).length > 0;
export const opLabel = (op: FilterOp): string => LABELS[op] ?? op;
export const needsValue = (op: FilterOp): boolean => op !== "is_empty" && op !== "is_not_empty";

/** The condition a new filter starts with: Contains for words and lists, otherwise the first one offered. */
export function defaultOp(type: string): FilterOp | null {
  if (TEXT.includes(type) || MANY.includes(type)) return "contains";
  return operatorsFor(type)[0] ?? null;
}

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Whether a filter says enough to apply: a property that exists, a condition it offers, and a value when one is needed. */
export function filterReady(f: ViewFilter, prop: SchemaProp | undefined): boolean {
  if (!prop || !operatorsFor(prop.type).includes(f.op)) return false;
  if (!needsValue(f.op)) return true;
  const v = f.value;
  if (prop.type === "checkbox") return typeof v === "boolean";
  if (CHOICE.includes(prop.type) || MANY.includes(prop.type)) return Array.isArray(v) && v.length > 0;
  if (NUMBER.includes(prop.type)) return typeof v !== "boolean" && !blank(v) && Number.isFinite(Number(v));
  if (DATE.includes(prop.type)) return typeof v === "string" && DAY.test(v);
  return typeof v === "string" && v.trim() !== "";
}

function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cell(row: Row, pid: string, prop: SchemaProp): unknown {
  if (prop.type === "title") return row[pid] ?? row.title;
  if (prop.type === "created_time") return row.created;
  if (prop.type === "last_edited_time") return row.edited ?? row.created;
  return row[pid];
}

/** Whether one row passes one ready filter. A blank number only passes ≠; a blank option passes Is not. */
export function matchesFilter(row: Row, f: ViewFilter, prop: SchemaProp, ctx: FilterContext = {}): boolean {
  const t = prop.type;
  const v = cell(row, f.pid, prop);
  if (t === "checkbox") return Boolean(v) === (f.value === true);
  if (f.op === "is_empty") return blank(v);
  if (f.op === "is_not_empty") return !blank(v);
  if (TEXT.includes(t)) {
    const have = String(v ?? "").trim().toLowerCase();
    const want = String(f.value ?? "").trim().toLowerCase();
    if (f.op === "is") return have === want;
    if (f.op === "is_not") return have !== want;
    if (f.op === "contains") return have.includes(want);
    if (f.op === "does_not_contain") return !have.includes(want);
    if (f.op === "starts_with") return have.startsWith(want);
    return have.endsWith(want);
  }
  if (NUMBER.includes(t)) {
    if (blank(v) || !Number.isFinite(Number(v))) return f.op === "ne";
    const a = Number(v);
    const b = Number(f.value);
    if (f.op === "eq") return a === b;
    if (f.op === "ne") return a !== b;
    if (f.op === "gt") return a > b;
    if (f.op === "lt") return a < b;
    if (f.op === "gte") return a >= b;
    return a <= b;
  }
  if (CHOICE.includes(t)) {
    const hit = typeof v === "string" && (f.value as unknown[]).includes(v);
    return f.op === "is_not" ? !hit : hit;
  }
  if (MANY.includes(t)) {
    const have: unknown[] = Array.isArray(v) ? v : [];
    const hit = (f.value as unknown[]).some((x) => have.includes(x));
    return f.op === "does_not_contain" ? !hit : hit;
  }
  if (DATE.includes(t)) {
    const day = typeof v === "number" ? (ctx.dayOf ?? localDay)(v) : typeof v === "string" ? v.slice(0, 10) : "";
    if (!DAY.test(day)) return false;
    const want = String(f.value);
    if (f.op === "is") return day === want;
    if (f.op === "before") return day < want;
    if (f.op === "after") return day > want;
    if (f.op === "on_or_before") return day <= want;
    return day >= want;
  }
  return true;
}

/** The rows every ready filter lets through, in the order they came. */
export function filterRows<R extends Row>(
  rows: readonly R[],
  filters: readonly ViewFilter[] | undefined,
  schema: Readonly<Record<string, SchemaProp>>,
  ctx: FilterContext = {},
): R[] {
  const live = (filters ?? []).filter((f) => filterReady(f, schema[f.pid]));
  if (!live.length) return rows.slice();
  return rows.filter((row) => live.every((f) => matchesFilter(row, f, schema[f.pid]!, ctx)));
}

/** The in-view search box: every word appears in the title, a text property or an option the row holds, in any case. */
export function searchRows<R extends Row>(rows: readonly R[], query: string, schema: Readonly<Record<string, SchemaProp>>): R[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows.slice();
  const keys = Object.keys(schema).filter((k) => [...TEXT, ...CHOICE, "multi_select"].includes(schema[k]!.type));
  return rows.filter((row) => {
    const hay = [row.title, ...keys.map((k) => row[k])]
      .map((x) => (Array.isArray(x) ? x.join(" ") : String(x ?? "")))
      .join("\n")
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** A filter as its chip reads: the property, then what it keeps ("Status: Done, In progress", "Due: is before Sep 14, 2026"). */
export function describeFilter(f: ViewFilter, prop: SchemaProp | undefined, nameOf: (userId: string) => string = (id) => id): string {
  if (!prop) return "Deleted property";
  const name = prop.name || "Untitled";
  if (!filterReady(f, prop)) return name;
  if (!needsValue(f.op)) return `${name}: ${opLabel(f.op).toLowerCase()}`;
  if (prop.type === "checkbox") return `${name}: ${f.value ? "Checked" : "Unchecked"}`;
  const value = Array.isArray(f.value)
    ? f.value.map((x) => (prop.type === "person" ? nameOf(String(x)) : String(x))).join(", ")
    : DATE.includes(prop.type)
      ? shortDay(String(f.value))
      : String(f.value).trim();
  return f.op === "is" || f.op === "contains" || f.op === "eq" ? `${name}: ${value}` : `${name}: ${opLabel(f.op).toLowerCase()} ${value}`;
}

/** Values for a row made while filters are on, so it starts inside the view it was made in. Titles stay empty. */
export function seedFromFilters(
  filters: readonly ViewFilter[] | undefined,
  schema: Readonly<Record<string, SchemaProp>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of filters ?? []) {
    const prop = schema[f.pid];
    if (!prop || !filterReady(f, prop) || !needsValue(f.op)) continue;
    const t = prop.type;
    if (t === "checkbox") out[f.pid] = f.value === true;
    else if (CHOICE.includes(t) && f.op === "is") out[f.pid] = (f.value as unknown[])[0];
    else if (MANY.includes(t) && f.op === "contains") out[f.pid] = [(f.value as unknown[])[0]];
    else if (t !== "title" && TEXT.includes(t) && ["is", "contains", "starts_with", "ends_with"].includes(f.op)) out[f.pid] = String(f.value).trim();
    else if (t === "number" && ["eq", "gte", "lte"].includes(f.op)) out[f.pid] = Number(f.value);
    else if (t === "date" && ["is", "on_or_before", "on_or_after"].includes(f.op)) out[f.pid] = String(f.value);
  }
  return out;
}
