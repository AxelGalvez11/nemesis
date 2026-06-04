// TDD for the digest-ranking comparator (doc-12 ordered key). Like the §9 engine,
// ranking is a PURE function — the digest order is deterministic and auditable,
// never model-decided. These tests ARE the spec for the doc-12 key (verbatim
// order): watchlist_match_specificity → source_importance → evidence_quality →
// recency → safety_affecting → dedupe. Run: deno test packages/shared/
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compareDigestItems,
  rankDigest,
  matchSpecificity,
  isSafetyAffecting,
  type DigestCandidate,
} from "./digest-ranking.ts";

// Neutral baseline; each test overrides only the key under test so an assertion
// reads as "these fields → this order".
let seq = 0;
function cand(p: Partial<DigestCandidate> = {}): DigestCandidate {
  seq += 1;
  return {
    id: p.id ?? `id-${String(seq).padStart(4, "0")}`,
    item_type: "drug",
    item_ref: "ent-1",
    update_type: "pubmed_new",
    title: "t",
    summary: null,
    source_id: p.source_id ?? `src-${seq}`,
    source_url: null,
    importance_score: 0.5,
    detected_at: "2026-06-01T00:00:00.000Z",
    evidence_rank: 2,
    ...p,
  };
}

function order(items: DigestCandidate[]): string[] {
  return [...items].sort(compareDigestItems).map((i) => i.id);
}

// ---- matchSpecificity: trial > drug > class > company > keyword ----
Deno.test("matchSpecificity ranks more specific follows higher", () => {
  assert(matchSpecificity("trial") > matchSpecificity("drug"));
  assert(matchSpecificity("drug") > matchSpecificity("class"));
  assert(matchSpecificity("class") > matchSpecificity("company"));
  assert(matchSpecificity("company") > matchSpecificity("keyword"));
});

// ---- isSafetyAffecting: only fda_safety + label_update ----
Deno.test("isSafetyAffecting flags safety event types only", () => {
  assert(isSafetyAffecting("fda_safety"));
  assert(isSafetyAffecting("label_update"));
  assert(!isSafetyAffecting("pubmed_new"));
  assert(!isSafetyAffecting("trial_results"));
  assert(!isSafetyAffecting("trial_status"));
  assert(!isSafetyAffecting("new_comparison"));
});

// ---- key 1: specificity dominates everything below it ----
Deno.test("specificity outranks a higher importance score", () => {
  const lowSpecHighImp = cand({ id: "a", item_type: "keyword", importance_score: 0.99 });
  const highSpecLowImp = cand({ id: "b", item_type: "trial", importance_score: 0.01 });
  assertEquals(order([lowSpecHighImp, highSpecLowImp]), ["b", "a"]);
});

// ---- key 2: importance (equal specificity) ----
Deno.test("higher source_importance first when specificity ties", () => {
  const lo = cand({ id: "a", importance_score: 0.2 });
  const hi = cand({ id: "b", importance_score: 0.8 });
  assertEquals(order([lo, hi]), ["b", "a"]);
});

// ---- key 3: evidence_quality (equal specificity+importance) ----
Deno.test("higher evidence_rank first when specificity+importance tie", () => {
  const weak = cand({ id: "a", evidence_rank: 0 });
  const strong = cand({ id: "b", evidence_rank: 4 });
  assertEquals(order([weak, strong]), ["b", "a"]);
});

// ---- key 4: recency (equal specificity+importance+evidence) ----
Deno.test("newer detected_at first when higher keys tie", () => {
  const old = cand({ id: "a", detected_at: "2026-05-01T00:00:00.000Z" });
  const fresh = cand({ id: "b", detected_at: "2026-06-03T00:00:00.000Z" });
  assertEquals(order([old, fresh]), ["b", "a"]);
});

// ---- key 5: safety_affecting (equal everything above) ----
Deno.test("safety-affecting first when keys 1-4 tie (doc-12 order)", () => {
  // Equal specificity (both drug), importance, evidence, recency; differ only
  // on update_type's safety classification.
  const research = cand({ id: "a", update_type: "pubmed_new" });
  const safety = cand({ id: "b", update_type: "fda_safety" });
  assertEquals(order([research, safety]), ["b", "a"]);
});

// ---- total order: deterministic id tiebreak when all keys equal ----
Deno.test("all keys equal → stable ascending id tiebreak", () => {
  const b = cand({ id: "id-b", source_id: "s1" });
  const a = cand({ id: "id-a", source_id: "s2" });
  assertEquals(order([b, a]), ["id-a", "id-b"]);
});

// ---- dedupe: same (update_type, source_id) collapses to the higher-ranked ----
Deno.test("rankDigest dedupes a repeated source-event, keeping the top-ranked", () => {
  // Same underlying event (pubmed_new + src-X) matched twice; the higher-evidence
  // copy must survive, the duplicate dropped.
  const dupLow = cand({ id: "low", source_id: "src-X", evidence_rank: 0 });
  const dupHigh = cand({ id: "high", source_id: "src-X", evidence_rank: 4 });
  const ranked = rankDigest([dupLow, dupHigh]);
  assertEquals(ranked.length, 1);
  assertEquals(ranked[0].id, "high");
});

// ---- dedupe does NOT collapse distinct source events ----
Deno.test("rankDigest keeps every distinct source_id (no false collapse)", () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    cand({ id: `art-${i}`, source_id: `src-${i}` }));
  const ranked = rankDigest(items);
  assertEquals(ranked.length, 12);
});

// ---- dedupe separates same source across different update_types ----
Deno.test("rankDigest treats same source under different types as distinct", () => {
  const a = cand({ id: "a", source_id: "src-1", update_type: "pubmed_new" });
  const b = cand({ id: "b", source_id: "src-1", update_type: "trial_results", item_type: "drug" });
  assertEquals(rankDigest([a, b]).length, 2);
});

// ---- purity + determinism ----
Deno.test("rankDigest is pure and deterministic", () => {
  const input = [cand({ id: "a" }), cand({ id: "b" }), cand({ id: "c" })];
  const snapshot = input.map((i) => i.id);
  const r1 = rankDigest(input).map((i) => i.id);
  const r2 = rankDigest(input).map((i) => i.id);
  assertEquals(r1, r2); // deterministic
  assertEquals(input.map((i) => i.id), snapshot); // input not mutated
});

// ---- empty input ----
Deno.test("rankDigest([]) === []", () => {
  assertEquals(rankDigest([]), []);
});

// ---- null source_id falls back to id for dedupe (never over-collapses) ----
Deno.test("null source_id items dedupe by id, not collapsed together", () => {
  const a = cand({ id: "a", source_id: null });
  const b = cand({ id: "b", source_id: null });
  assertEquals(rankDigest([a, b]).length, 2);
});
