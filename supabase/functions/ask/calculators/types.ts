// Clinical calculators — shared contract. Every calculator is a PURE, deterministic function
// (real code, never LLM arithmetic) that echoes its inputs, states the formula it used, and
// cites a source. The answer engine calls these as tools: it reads `inputs` to know what to ask
// the user, calls `run`, and presents value + formula + source + warnings.
//
// UNITS (US convention, matching openFDA/US labels — SI variants are a later addition):
//   weight kg · height cm · age years · serum creatinine mg/dL · calcium mg/dL · albumin g/dL ·
//   sodium/glucose/BUN mg/dL (glucose, BUN) or mmol|mEq/L where noted on the input.
// Calculators must validate inputs and throw CalcError on out-of-range/missing values rather
// than return a silently-wrong number.

export class CalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalcError";
  }
}

export type CalcArgValue = number | string | boolean;
export type CalcArgs = Record<string, CalcArgValue>;

export interface CalcInput {
  key: string;
  label: string;
  type: "number" | "enum" | "boolean";
  unit?: string;
  options?: string[]; // for type "enum"
  min?: number; // for type "number" (inclusive sanity bound)
  max?: number;
  required: boolean;
}

export interface CalcResult {
  value: number; // primary numeric result (NaN only if the result is categorical — see `category`)
  unit: string;
  label: string; // e.g. "Creatinine clearance (Cockcroft-Gault)"
  category?: string; // e.g. "CKD stage G3b" / "Child-Pugh class B" / "high risk"
  interpretation?: string; // one-line plain-English meaning
  formula: string; // the exact formula/rule applied, human-readable
  inputsEcho: CalcArgs; // the inputs used, for transparency
  source: string; // citation (guideline/paper/CDC/label)
  warnings?: string[]; // caveats (e.g. "validated for steady-state SCr only")
}

export interface CalculatorDef {
  id: string; // stable kebab id, e.g. "crcl-cockcroft-gault"
  name: string;
  category: "renal" | "hepatic" | "body" | "labs" | "conversion" | "risk-score" | "pulmonary";
  description: string;
  inputs: CalcInput[];
  source: string;
  run: (args: CalcArgs) => CalcResult;
}

// ── input helpers (shared validation so every calculator fails loudly, not silently) ──

export function num(args: CalcArgs, key: string, opts: { min?: number; max?: number } = {}): number {
  const raw = args[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  if (raw === undefined || raw === null || raw === "" || Number.isNaN(n)) {
    throw new CalcError(`missing or non-numeric input: ${key}`);
  }
  if (opts.min !== undefined && n < opts.min) throw new CalcError(`${key}=${n} below minimum ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new CalcError(`${key}=${n} above maximum ${opts.max}`);
  return n;
}

export function enumArg(args: CalcArgs, key: string, options: readonly string[]): string {
  const v = String(args[key] ?? "");
  if (!options.includes(v)) throw new CalcError(`${key} must be one of [${options.join(", ")}], got "${v}"`);
  return v;
}

export function boolArg(args: CalcArgs, key: string): boolean {
  const v = args[key];
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "yes" || v === 1 || v === "1") return true;
  if (v === "false" || v === "no" || v === 0 || v === "0" || v === undefined || v === "") return false;
  throw new CalcError(`${key} must be boolean-like, got "${String(v)}"`);
}

/** Round to `dp` decimals (display-only; never feed back into a chained calc). */
export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
