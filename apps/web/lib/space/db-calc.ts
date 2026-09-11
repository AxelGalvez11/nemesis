// ── Column calculations ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The line under a table column (Calculate): a count, a share, a sum or a span of dates over the rows the view shows, so
// filters and search change the answer. A column keeps its choice as `calc` on the view's column entry, which syncs.
// Rows are the frontend's objects: the title under the title property's id, other properties under their schema ids,
// `created` and `edited` in milliseconds.

export type CalcFn =
  | "count_all"
  | "count_values"
  | "count_empty"
  | "count_unique"
  | "percent_empty"
  | "percent_not_empty"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range"
  | "earliest"
  | "latest"
  | "date_range"
  | "checked"
  | "unchecked"
  | "percent_checked"
  | "percent_unchecked";

export interface CalcProp {
  name?: string;
  type: string;
}

export interface CalcResult {
  /** The short word drawn before the value ("Sum", "Empty"). */
  label: string;
  /** The value as drawn; empty when there is nothing to calculate from. */
  value: string;
}

type Row = { title?: unknown; created?: unknown; edited?: unknown; [key: string]: unknown };

const MENU: Record<CalcFn, string> = {
  count_all: "Count all",
  count_values: "Count values",
  count_empty: "Count empty",
  count_unique: "Count unique values",
  percent_empty: "Percent empty",
  percent_not_empty: "Percent not empty",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  earliest: "Earliest date",
  latest: "Latest date",
  date_range: "Date range",
  checked: "Checked",
  unchecked: "Unchecked",
  percent_checked: "Percent checked",
  percent_unchecked: "Percent unchecked",
};

const DATES = ["date", "created_time", "last_edited_time"];
const COUNTS: CalcFn[] = ["count_all", "count_values", "count_empty", "count_unique", "percent_empty", "percent_not_empty"];

/** The calculations a property type offers, in menu order. */
export function calcsFor(type: string): CalcFn[] {
  if (type === "number") return [...COUNTS, "sum", "average", "median", "min", "max", "range"];
  if (DATES.includes(type)) return [...COUNTS, "earliest", "latest", "date_range"];
  if (type === "checkbox") return ["count_all", "checked", "unchecked", "percent_checked", "percent_unchecked"];
  if (type === "formula") return ["count_all"];
  return COUNTS;
}

/** The calculation's name in the Calculate menu. */
export const calcLabel = (fn: CalcFn): string => MENU[fn] ?? fn;

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function cell(row: Row, pid: string, prop: CalcProp): unknown {
  if (prop.type === "title") return row[pid] ?? row.title;
  if (prop.type === "created_time") return row.created;
  if (prop.type === "last_edited_time") return row.edited ?? row.created;
  return row[pid];
}

const trim = (x: number) => String(Math.round(x * 100) / 100);
const percent = (part: number, whole: number) => `${whole ? Math.round((part * 1000) / whole) / 10 : 0}%`;

function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The calculation over these rows, or null when the property type does not offer it. */
export function calculate(
  fn: CalcFn,
  rows: readonly Row[],
  pid: string,
  prop: CalcProp,
  ctx: { dayOf?: (ms: number) => string } = {},
): CalcResult | null {
  if (!calcsFor(prop.type).includes(fn)) return null;
  const values = rows.map((row) => cell(row, pid, prop));
  const total = values.length;
  const filled = values.filter((v) => !blank(v));
  switch (fn) {
    case "count_all":
      return { label: "Count", value: String(total) };
    case "count_values":
      return { label: "Values", value: String(filled.reduce((sum: number, v) => sum + (Array.isArray(v) ? v.length : 1), 0)) };
    case "count_empty":
      return { label: "Empty", value: String(total - filled.length) };
    case "count_unique":
      return { label: "Unique", value: String(new Set(filled.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => (v && typeof v === "object" ? String((v as { ref?: unknown }).ref ?? JSON.stringify(v)) : String(v).trim().toLowerCase()))).size) };
    case "percent_empty":
      return { label: "Empty", value: percent(total - filled.length, total) };
    case "percent_not_empty":
      return { label: "Not empty", value: percent(filled.length, total) };
    case "checked":
      return { label: "Checked", value: String(values.filter(Boolean).length) };
    case "unchecked":
      return { label: "Unchecked", value: String(values.filter((v) => !v).length) };
    case "percent_checked":
      return { label: "Checked", value: percent(values.filter(Boolean).length, total) };
    case "percent_unchecked":
      return { label: "Unchecked", value: percent(values.filter((v) => !v).length, total) };
  }
  if (fn === "sum" || fn === "average" || fn === "median" || fn === "min" || fn === "max" || fn === "range") {
    const nums = filled.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const label = MENU[fn];
    if (!nums.length) return { label, value: fn === "sum" ? "0" : "" };
    const sum = nums.reduce((a, b) => a + b, 0);
    const mid = Math.floor(nums.length / 2);
    const value =
      fn === "sum" ? sum
      : fn === "average" ? sum / nums.length
      : fn === "median" ? (nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2)
      : fn === "min" ? nums[0]!
      : fn === "max" ? nums[nums.length - 1]!
      : nums[nums.length - 1]! - nums[0]!;
    return { label, value: trim(value) };
  }
  const days = filled
    .map((v) => (typeof v === "number" ? (ctx.dayOf ?? localDay)(v) : String(v).slice(0, 10)))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const label = fn === "earliest" ? "Earliest" : fn === "latest" ? "Latest" : "Range";
  if (!days.length) return { label, value: "" };
  if (fn === "earliest") return { label, value: shortDay(days[0]!) };
  if (fn === "latest") return { label, value: shortDay(days[days.length - 1]!) };
  const span = Math.round((Date.parse(`${days[days.length - 1]}T12:00:00Z`) - Date.parse(`${days[0]}T12:00:00Z`)) / 864e5);
  return { label, value: `${span} ${span === 1 ? "day" : "days"}` };
}
