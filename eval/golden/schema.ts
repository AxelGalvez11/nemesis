// eval/golden/schema.ts
// Self-contained golden-set schema + loader. Deliberately NO external deps (npm:zod removed):
// the repo has a root package.json, which puts Deno in node_modules mode, so an `npm:` import
// resolves locally (node_modules present) but FAILS in CI (no install step). A hand-rolled
// validator keeps the eval harness resolvable anywhere with only std + Deno APIs.

const PROVIDERS = ["pubmed_oa", "clinicaltrials", "dailymed", "openfda", "rxnorm", "fda_orange_book"] as const;
export type Provider = typeof PROVIDERS[number];

const ANSWERABILITY = ["answerable", "unanswerable"] as const;
export type Answerability = typeof ANSWERABILITY[number];

export interface ProviderId {
  provider: Provider;
  provider_id: string; // PMID | NCT id | SPL set-id
}

export interface GoldenItem {
  id: string;
  question: string;
  intent: string; // e.g. drug_overview, side_effects, drug_interaction
  answerability: Answerability;
  expected_sources: ProviderId[];
  notes?: string;
  needs_expert_review: boolean;
  openevidence_slice: boolean;
}

function fail(msg: string): never {
  throw new Error(`golden-set validation: ${msg}`);
}

function asNonEmptyString(v: unknown, ctx: string): string {
  if (typeof v !== "string" || v.length === 0) fail(`${ctx} must be a non-empty string`);
  return v;
}

function parseProviderId(raw: unknown, ctx: string): ProviderId {
  if (typeof raw !== "object" || raw === null) fail(`${ctx} must be an object`);
  const o = raw as Record<string, unknown>;
  const provider = asNonEmptyString(o.provider, `${ctx}.provider`);
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    fail(`${ctx}.provider "${provider}" not in [${PROVIDERS.join(", ")}]`);
  }
  return { provider: provider as Provider, provider_id: asNonEmptyString(o.provider_id, `${ctx}.provider_id`) };
}

export function parseGoldenItem(raw: unknown, ctx: string): GoldenItem {
  if (typeof raw !== "object" || raw === null) fail(`${ctx} must be an object`);
  const o = raw as Record<string, unknown>;
  const answerability = asNonEmptyString(o.answerability, `${ctx}.answerability`);
  if (!(ANSWERABILITY as readonly string[]).includes(answerability)) {
    fail(`${ctx}.answerability "${answerability}" not in [${ANSWERABILITY.join(", ")}]`);
  }
  const expectedRaw = o.expected_sources ?? [];
  if (!Array.isArray(expectedRaw)) fail(`${ctx}.expected_sources must be an array`);
  return {
    id: asNonEmptyString(o.id, `${ctx}.id`),
    question: asNonEmptyString(o.question, `${ctx}.question`),
    intent: asNonEmptyString(o.intent, `${ctx}.intent`),
    answerability: answerability as Answerability,
    expected_sources: expectedRaw.map((p, i) => parseProviderId(p, `${ctx}.expected_sources[${i}]`)),
    notes: typeof o.notes === "string" ? o.notes : undefined,
    needs_expert_review: o.needs_expert_review === undefined ? true : Boolean(o.needs_expert_review),
    openevidence_slice: Boolean(o.openevidence_slice ?? false),
  };
}

export async function loadGolden(path = new URL("./golden-set.json", import.meta.url)): Promise<GoldenItem[]> {
  const raw = JSON.parse(await Deno.readTextFile(path));
  if (!Array.isArray(raw)) fail("golden-set.json must be a JSON array");
  return raw.map((item, i) => parseGoldenItem(item, `item[${i}]`)); // fail-fast on malformed gold
}
