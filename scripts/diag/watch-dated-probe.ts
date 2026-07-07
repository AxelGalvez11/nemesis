// READ-ONLY live probe (uncommitted diag) — verifies the source APIs actually answer
// "what's new since date X", the keystone the watch-check edge function depends on.
//
// WHY THIS EXISTS (advisor-mandated): every watch-detect / watch-cycle unit test so far
// validates PLUMBING (given fetched records, the diff is correct) — NOT that a dated query
// against the live API returns the recent records in the first place. A past workstream
// (WS-F) paid for exactly this gap: offline-green code whose live premise was false. So,
// before building the edge function, confirm LIVE + read-only that:
//   PubMed   esearch datetype=edat + mindate/maxdate  scopes to recently-INDEXED papers
//   CT.gov   filter.advanced AREA[LastUpdatePostDate]RANGE  scopes to recently-UPDATED trials
//   openFDA  search ... AND effective_time:[X TO Y]    scopes to recently-effective labels
// and that each composes with the existing query shape (PubMed term, openFDA name-scope).
//
// Run: deno run --allow-net scripts/diag/watch-dated-probe.ts
// No DB, no writes, no LLM, no cost. Public APIs only (NCBI/CT.gov/openFDA).

const UA = "PharmaOrbWatchProbe/1.0 (+https://pharmaorb.app)";
const TOPIC = "semaglutide"; // a hot topic guaranteed recent literature + active trials
const DRUG = "atorvastatin"; // a common, long-marketed drug for the openFDA label test

// ── date windows (computed live so the probe is reproducible) ───────────────────────────
const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * 86_400_000);
const RECENT = daysAgo(30);
const OLD_FROM = new Date("2015-01-01T00:00:00Z");
const OLD_TO = new Date("2015-12-31T00:00:00Z");

const pubmedDate = (d: Date) => `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
const ctDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fdaDate = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

let passes = 0;
let total = 0;
function verdict(name: string, ok: boolean, detail: string) {
  total++;
  if (ok) passes++;
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}\n        ${detail}\n`);
}

// ─────────────────────────────── PubMed ─────────────────────────────────────────────────
async function probePubMed() {
  const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
  const apiKey = Deno.env.get("NCBI_API_KEY") ?? "";
  const count = async (extra: Record<string, string>): Promise<number> => {
    const p = new URLSearchParams({ db: "pubmed", term: TOPIC, retmax: "0", retmode: "json", ...extra });
    if (apiKey) p.set("api_key", apiKey);
    const res = await fetch(`${ESEARCH}?${p}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return Number(j?.esearchresult?.count ?? 0);
  };
  // also pull the actual recent idlist so we can prove the filter scopes
  const recentIds = async (): Promise<string[]> => {
    const p = new URLSearchParams({
      db: "pubmed",
      term: TOPIC,
      retmax: "5",
      retmode: "json",
      datetype: "edat",
      mindate: pubmedDate(RECENT),
      maxdate: pubmedDate(now),
    });
    if (apiKey) p.set("api_key", apiKey);
    const res = await fetch(`${ESEARCH}?${p}`, { headers: { "User-Agent": UA } });
    const j = await res.json();
    return j?.esearchresult?.idlist ?? [];
  };
  try {
    const all = await count({});
    await sleep(400);
    const recent = await count({ datetype: "edat", mindate: pubmedDate(RECENT), maxdate: pubmedDate(now) });
    await sleep(400);
    const old = await count({ datetype: "edat", mindate: pubmedDate(OLD_FROM), maxdate: pubmedDate(OLD_TO) });
    await sleep(400);
    const ids = await recentIds();
    // The filter works iff: recent window > 0 (there ARE new papers), AND it scopes
    // (recent << all, and recent != old → the window is honored, not ignored).
    const scopes = recent > 0 && recent < all && recent !== old;
    verdict(
      "PubMed datetype=edat mindate/maxdate scopes to recently-indexed papers",
      scopes,
      `all-time="${TOPIC}"=${all} · last-30d=${recent} · 2015-window=${old} · recent idlist sample=[${ids.slice(0, 3).join(", ")}]`,
    );
  } catch (e) {
    verdict("PubMed dated query", false, `threw: ${msg(e)}`);
  }
}

// ─────────────────────────── ClinicalTrials.gov v2 ──────────────────────────────────────
async function probeClinicalTrials() {
  const BASE = "https://clinicaltrials.gov/api/v2/studies";
  const fetchStudies = async (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      "query.term": TOPIC,
      pageSize: "10",
      countTotal: "true",
      format: "json",
      "fields": "NCTId,LastUpdatePostDate,BriefTitle",
      ...extra,
    });
    const res = await fetch(`${BASE}?${p}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return await res.json();
  };
  try {
    const from = ctDate(RECENT);
    const filtered = await fetchStudies({ "filter.advanced": `AREA[LastUpdatePostDate]RANGE[${from},MAX]` });
    await sleep(300);
    const unfiltered = await fetchStudies({});
    const studies = filtered?.studies ?? [];
    const dates: string[] = studies.map(
      (s: { protocolSection?: { statusModule?: { lastUpdatePostDateStruct?: { date?: string } } } }) =>
        s?.protocolSection?.statusModule?.lastUpdatePostDateStruct?.date ?? "",
    ).filter(Boolean);
    // The filter works iff: it returns trials, ALL of their last-update dates fall in [from, today],
    // and the filtered total < unfiltered total (the range actually narrows the set).
    const allInWindow = dates.length > 0 && dates.every((d) => d >= from);
    const narrows = (filtered?.totalCount ?? 0) < (unfiltered?.totalCount ?? 0);
    verdict(
      "CT.gov v2 filter.advanced AREA[LastUpdatePostDate]RANGE scopes to recently-updated trials",
      allInWindow && narrows,
      `filtered total=${filtered?.totalCount} · unfiltered total=${unfiltered?.totalCount} · returned ${studies.length}, last-update dates=[${dates.slice(0, 4).join(", ")}] (window from ${from})`,
    );
  } catch (e) {
    verdict("CT.gov dated query", false, `threw: ${msg(e)}`);
  }
}

// ─────────────────────────────── openFDA ────────────────────────────────────────────────
async function probeOpenFda() {
  const BASE = "https://api.fda.gov/drug/label.json";
  const apiKey = Deno.env.get("OPENFDA_API_KEY");
  const search = async (value: string, limit = 5) => {
    const p = new URLSearchParams({ limit: String(limit), search: value });
    if (apiKey) p.set("api_key", apiKey);
    const res = await fetch(`${BASE}?${p}`, { headers: { "User-Agent": UA } });
    if (res.status === 404) return { results: [], meta: { results: { total: 0 } } };
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return await res.json();
  };
  try {
    const nameScope = `(openfda.generic_name:"${DRUG}" OR openfda.brand_name:"${DRUG}")`;
    // openFDA label updates are RARE per drug, so test the date MECHANISM with a wide window
    // (all of 2024-2026) rather than 30 days — a per-cycle 30d window legitimately returns []
    // for most drugs, which is correct (a label change is itself the rare alert-worthy event).
    const from = "20240101";
    const to = fdaDate(now);
    const dated = await search(`${nameScope} AND effective_time:[${from} TO ${to}]`);
    await sleep(300);
    const undated = await search(nameScope, 1);
    const labels = dated?.results ?? [];
    const times: string[] = labels.map((l: { effective_time?: string }) => l?.effective_time ?? "").filter(Boolean);
    // The filter works iff: it returns labels AND every effective_time falls in [from, to].
    const allInWindow = times.length > 0 && times.every((t) => t >= from && t <= to);
    verdict(
      "openFDA search ... AND effective_time:[X TO Y] composes with name-scope + honors the range",
      allInWindow,
      `name-scoped total(all)=${undated?.meta?.results?.total} · dated returned=${labels.length} · effective_times=[${times.slice(0, 4).join(", ")}] (window ${from}–${to})`,
    );
    // Secondary: confirm a NARROW recent window behaves (may legitimately be 0 — that's the point).
    await sleep(300);
    const narrow = await search(`${nameScope} AND effective_time:[${fdaDate(RECENT)} TO ${to}]`, 5);
    console.log(
      `        ↳ note: ${DRUG} label changes in the last 30d = ${narrow?.results?.length ?? 0} (0 is normal/correct — a label change is a rare, alert-worthy event)\n`,
    );
  } catch (e) {
    verdict("openFDA dated query", false, `threw: ${msg(e)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

console.log(`\n── watch dated-query probe ──  today=${ctDate(now)}  recent-window-from=${ctDate(RECENT)}\n`);
await probePubMed();
await probeClinicalTrials();
await probeOpenFda();
console.log(`──────────────────────────────\n${passes}/${total} core dated sources verified.\n`);
