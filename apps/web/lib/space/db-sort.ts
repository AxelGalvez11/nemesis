// ── Database sorts and table groups ─────────────────────────────────────────────────────────────────────────────────
//
// A view sorts by `sorts` ([{ id, pid, dir }], first one first). Views saved before several sorts existed carry a single
// `sort` ({ pid, dir }), read here as a list of one. Blank values sort after everything else in either direction, and
// rows that compare equal keep the order they came in, which is the database's own order.

export interface ViewSort {
  id: string;
  pid: string;
  dir: "asc" | "desc";
}

export interface SortProp {
  name?: string;
  type: string;
  options?: ReadonlyArray<{ value: string }>;
}

export interface SortContext {
  /** A person's name, so a Person property sorts by names rather than ids. */
  nameOf?: (userId: string) => string;
}

type Row = { id?: string; title?: unknown; created?: unknown; edited?: unknown; [key: string]: unknown };

/** The sorts a view holds, first one first; a view from before several sorts gives its one sort. */
export function sortsOf(view: { sorts?: unknown; sort?: unknown }): ViewSort[] {
  if (Array.isArray(view.sorts)) {
    return view.sorts
      .filter((s): s is { id?: unknown; pid: string; dir?: unknown } => typeof s === "object" && s !== null && typeof (s as { pid?: unknown }).pid === "string")
      .map((s, i) => ({ id: typeof s.id === "string" ? s.id : `sort-${i}`, pid: s.pid, dir: s.dir === "desc" ? "desc" : "asc" }));
  }
  const one = view.sort as { pid?: unknown; dir?: unknown } | null | undefined;
  return one && typeof one.pid === "string" ? [{ id: "sort", pid: one.pid, dir: one.dir === "desc" ? "desc" : "asc" }] : [];
}

function optionIndex(prop: SortProp, value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const i = (prop.options ?? []).findIndex((o) => o.value === value);
  return i < 0 ? (prop.options ?? []).length : i;
}

function sortKey(row: Row, pid: string, prop: SortProp, ctx: SortContext): number | string | null {
  const t = prop.type;
  const v = t === "title" ? (row[pid] ?? row.title) : t === "created_time" ? row.created : t === "last_edited_time" ? (row.edited ?? row.created) : row[pid];
  if (t === "number" || t === "auto_increment_id") return v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  if (t === "checkbox") return v ? 1 : 0;
  if (t === "created_time" || t === "last_edited_time") return typeof v === "number" ? v : null;
  if (t === "select" || t === "status") return optionIndex(prop, v);
  if (t === "multi_select") return optionIndex(prop, Array.isArray(v) ? v[0] : undefined);
  if (t === "person") {
    const first = Array.isArray(v) ? v[0] : undefined;
    return typeof first === "string" ? (ctx.nameOf ? ctx.nameOf(first) : first) : null;
  }
  if (t === "date") return typeof v === "string" && v ? v : null;
  const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return text.trim() ? text : null;
}

const compare = (a: number | string, b: number | string) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });

/** Rows in sort order. Sorts on a property that is gone are skipped; with none left, the rows keep their order. */
export function sortRowsBy<R extends Row>(
  rows: readonly R[],
  sorts: readonly ViewSort[],
  schema: Readonly<Record<string, SortProp>>,
  ctx: SortContext = {},
): R[] {
  const live = sorts.filter((s) => schema[s.pid]);
  if (!live.length) return rows.slice();
  const keyed = rows.map((row, index) => ({ row, index, keys: live.map((s) => sortKey(row, s.pid, schema[s.pid]!, ctx)) }));
  keyed.sort((x, y) => {
    for (let i = 0; i < live.length; i++) {
      const a = x.keys[i]!;
      const b = y.keys[i]!;
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const c = compare(a, b);
      if (c !== 0) return live[i]!.dir === "desc" ? -c : c;
    }
    return x.index - y.index;
  });
  return keyed.map((k) => k.row);
}

/** The sort chip: the property for one sort, a count for several. */
export function describeSorts(sorts: readonly ViewSort[], schema: Readonly<Record<string, SortProp>>): string {
  const live = sorts.filter((s) => schema[s.pid]);
  if (!live.length) return "";
  return live.length === 1 ? schema[live[0]!.pid]!.name || "Untitled" : `${live.length} sorts`;
}

export interface RowGroup<R> {
  /** Stable across renders and browsers: the option's value, "true"/"false", or "" for the rows with none. */
  key: string;
  value: string | boolean | null;
  label: string;
  rows: R[];
}

/** Whether a table can group by this property type. */
export const groupable = (type: string): boolean => type === "select" || type === "status" || type === "checkbox";

/**
 * A table's groups, in the property's option order. Rows whose value is not one of the options (none, or one since
 * deleted) gather in a "No <property>" group first, which is left out when empty. Rows keep their order within a group.
 */
export function groupRows<R extends Row>(rows: readonly R[], pid: string, prop: SortProp): RowGroup<R>[] {
  if (prop.type === "checkbox") {
    return [
      { key: "true", value: true, label: "Checked", rows: rows.filter((r) => Boolean(r[pid])) },
      { key: "false", value: false, label: "Unchecked", rows: rows.filter((r) => !r[pid]) },
    ];
  }
  const options = prop.options ?? [];
  const known = new Set(options.map((o) => o.value));
  const none = rows.filter((r) => typeof r[pid] !== "string" || !known.has(r[pid] as string));
  return [
    ...(none.length ? [{ key: "", value: null, label: `No ${prop.name || "value"}`, rows: none }] : []),
    ...options.map((o) => ({ key: o.value, value: o.value, label: o.value, rows: rows.filter((r) => r[pid] === o.value) })),
  ];
}
