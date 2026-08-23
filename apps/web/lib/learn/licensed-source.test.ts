import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admitSource, LICENCE_GATE_VERSION, type LicenceAttestation } from "./licensed-source";
import { isReusableLicence } from "./visual-provenance";

// 🔴🔴 THE CASES BELOW ARE REAL AND WERE VERIFIED AGAINST THE PUBLISHERS' OWN PAGES ON 2026-08-22.
//
// OpenStax, MIT OpenCourseWare and WHO are the three sources anybody building an academic corpus
// reaches for first. All three are CC BY-NC-SA. Nemesis charges money, so all three are refusals —
// and MIT's terms name this product's exact shape: "a commercial education business cannot offer
// courses based on OCW materials if students pay fees and the business intends to profit".
//
// A gate that admits any of them looks like it is working right up until it is a legal problem, and
// no functional test anywhere in this repo would notice.

function attestation(over: Partial<LicenceAttestation> = {}): LicenceAttestation {
  return {
    attributionText: "Some Author, CC BY 4.0",
    commercialUse: true,
    derivatives: true,
    licenseName: "CC-BY-4.0",
    role: "curriculum_seed",
    shareAlike: false,
    sourceId: "00000000-0000-0000-0000-000000000001",
    sourceVersion: "1st edition",
    status: "approved",
    verifiedAt: "2026-08-22",
    ...over,
  };
}

test("🔴🔴 the three obvious educational publishers are all refused", () => {
  const nonCommercial = [
    { licenseName: "CC-BY-NC-SA-4.0", who: "OpenStax (current editions)" },
    { licenseName: "CC-BY-NC-SA-4.0", who: "MIT OpenCourseWare" },
    { licenseName: "CC-BY-NC-SA-3.0-IGO", who: "WHO publications" },
    { licenseName: "CC-BY-NC-4.0", who: "a non-commercial dataset" },
  ];
  for (const source of nonCommercial) {
    const verdict = admitSource(attestation({ licenseName: source.licenseName }));
    assert.equal(verdict.ok, false, `${source.who} (${source.licenseName}) was admitted`);
    if (!verdict.ok) assert.equal(verdict.refusal, "licence-not-reusable");
  }
});

test("🔴🔴 a prefix match can never creep back in", () => {
  // `startsWith("CC BY")` admits `CC BY-NC`. reference-images.ts names this trap by hand; this is
  // the assertion that stops it being reintroduced as a "small tidy-up" in either call site.
  assert.equal(isReusableLicence("CC-BY-4.0"), true);
  assert.equal(isReusableLicence("CC-BY-NC-4.0"), false);
  assert.equal(isReusableLicence("CC-BY-NC-SA-4.0"), false);
  assert.equal(isReusableLicence("CC-BY-ND-4.0"), false);
});

test("🔴🔴 the name and the recorded rights are BOTH checked", () => {
  // Two opposite mistakes. A vetted identifier whose row was filled in wrong is not caught by the
  // allow list, and an unvetted identifier is not caught by the booleans.
  const wrongRow = admitSource(attestation({ commercialUse: false }));
  assert.equal(wrongRow.ok, false, "a CC-BY row recording no commercial use was admitted");
  if (!wrongRow.ok) assert.equal(wrongRow.refusal, "commercial-use-denied");

  const noDerivs = admitSource(attestation({ derivatives: false }));
  assert.equal(noDerivs.ok, false, "a no-derivatives row was admitted, and ingest makes a derivative");
  if (!noDerivs.ok) assert.equal(noDerivs.refusal, "derivatives-denied");
});

test("🔴🔴 only an approved attestation may be built on", () => {
  for (const status of ["review", "blocked"] as const) {
    const verdict = admitSource(attestation({ status }));
    assert.equal(verdict.ok, false, `a "${status}" attestation was admitted`);
    if (!verdict.ok) assert.equal(verdict.refusal, "not-approved");
  }
});

test("🔴 a source with no recorded role is unknown, never permitted", () => {
  // Every core_sources row written before 2026-08-23 has source_role NULL.
  const verdict = admitSource(attestation({ role: null }));
  assert.equal(verdict.ok, false, "a source with no role was admitted");
  if (!verdict.ok) assert.equal(verdict.refusal, "role-unknown");
});

test("🔴🔴 an alignment target may be read and may never be ingested", () => {
  // AP, NCLEX, USMLE, CPA, CFA. Their outlines are published so candidates can study from them.
  // Published is not licensed, and the role is what says so.
  const verdict = admitSource(attestation({ licenseName: "CC0-1.0", role: "alignment_target" }));
  assert.equal(verdict.ok, false, "an alignment target was admitted into the corpus");
  if (!verdict.ok) assert.equal(verdict.refusal, "role-forbids-ingestion");
});

test("🔴 an unrecognised licence is a no, never a maybe", () => {
  for (const licenseName of ["", "   ", "open", "free to use", "educational use", "CC-BY-9.9", "MIT"]) {
    const verdict = admitSource(attestation({ licenseName }));
    assert.equal(verdict.ok, false, `"${licenseName}" was admitted`);
  }
});

test("🔴 a publisher name is not a licence", () => {
  const verdict = admitSource(attestation({ licenseName: "" }));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.refusal, "licence-missing");
});

test("🔴 an attestation with no edition names nothing checkable", () => {
  // OpenStax's older editions are CC BY and its current ones are CC BY-NC-SA. A CC grant cannot be
  // revoked, so both are true at once and only the edition says which row means which.
  const verdict = admitSource(attestation({ sourceVersion: "  " }));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.refusal, "version-missing");
});

test("🔴 a credit line that was never kept could never be displayed", () => {
  const verdict = admitSource(attestation({ attributionText: undefined, licenseName: "CC-BY-SA-4.0" }));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.refusal, "attribution-missing");
});

test("🔴 CC0 and public domain need no credit line", () => {
  for (const licenseName of ["CC0-1.0", "public-domain"]) {
    const verdict = admitSource(attestation({ attributionText: undefined, licenseName }));
    assert.equal(verdict.ok, true, `${licenseName} was refused`);
    if (verdict.ok) assert.equal(verdict.source.attributionRequired, false);
  }
});

test("🔴 a verification date must be a real day somebody could have read it on", () => {
  for (const verifiedAt of ["", "soon", "2026-13-01", "2026-02-30", "22/08/2026"]) {
    const verdict = admitSource(attestation({ verifiedAt }));
    assert.equal(verdict.ok, false, `"${verifiedAt}" passed as a verification date`);
    if (!verdict.ok) assert.equal(verdict.refusal, "unverified");
  }
});

test("🔴 a timestamptz from Postgres is a valid verification date", () => {
  // verified_at is timestamptz, so the reader hands over a full ISO string, not a bare day.
  const verdict = admitSource(attestation({ verifiedAt: "2026-08-22T14:03:11.482Z" }));
  assert.equal(verdict.ok, true, "a real Postgres timestamp was rejected as a date");
});

test("🔴 an admitted source carries the gate, the credit and the share-alike promise", () => {
  const verdict = admitSource(attestation({ shareAlike: true }));
  assert.equal(verdict.ok, true);
  if (verdict.ok) {
    assert.equal(verdict.source.gateVersion, LICENCE_GATE_VERSION);
    assert.equal(verdict.source.attributionRequired, true);
    assert.equal(verdict.source.attributionText, "Some Author, CC BY 4.0");
    assert.equal(verdict.source.shareAlike, true);
    assert.equal(verdict.source.sourceId, "00000000-0000-0000-0000-000000000001");
  }
});

test("🔴 every refusal is distinguishable — a silence and a rejection are not the same outcome", () => {
  const reasons = new Set<string>();
  const cases: LicenceAttestation[] = [
    attestation({ status: "review" }),
    attestation({ role: null }),
    attestation({ role: "alignment_target" }),
    attestation({ sourceVersion: "" }),
    attestation({ verifiedAt: "nope" }),
    attestation({ licenseName: "" }),
    attestation({ licenseName: "CC-BY-NC-4.0" }),
    attestation({ commercialUse: false }),
    attestation({ derivatives: false }),
    attestation({ attributionText: undefined, licenseName: "CC-BY-4.0" }),
  ];
  for (const input of cases) {
    const verdict = admitSource(input);
    if (!verdict.ok) {
      reasons.add(verdict.refusal);
      assert.ok(verdict.detail.length > 0, `${verdict.refusal} refused without saying why`);
    }
  }
  assert.equal(reasons.size, 10, `expected ten distinct refusals, got ${[...reasons].join(", ")}`);
});

// ── source-shape guards ─────────────────────────────────────────────────────────────────────────

/** Comments stripped, because a guard that matches its own warning proves nothing. */
function code(source: string): string {
  return source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const GATE = code(readFileSync(new URL("./licensed-source.ts", import.meta.url), "utf8"));
const PROVENANCE = code(readFileSync(new URL("./visual-provenance.ts", import.meta.url), "utf8"));

test("🔴🔴 the gate mints NO source identity — core_sources is the only catalogue", () => {
  // Owner ruling 2026-08-23: "Do not create a second competing source table." An earlier draft of
  // this module carried its own id, name and url, which is a second answer to "what source is this"
  // and the second answer is always the one that goes stale.
  assert.match(GATE, /sourceId/, "the gate no longer references a core_sources id");
  for (const forbidden of ["randomUUID", "gen_random_uuid", "crypto."]) {
    assert.ok(!GATE.includes(forbidden), `licensed-source.ts is generating ids with "${forbidden}"`);
  }
  // A `name` or `url` field would be catalogue data. The gate reads an attestation and a role.
  assert.ok(
    !/readonly\s+(name|url|title|canonicalUrl)\s*[?:]/.test(GATE),
    "licensed-source.ts has grown source-catalogue fields — those belong on core_sources",
  );
});

test("🔴🔴 there is ONE reusable-licence rule, with two call sites", () => {
  assert.match(PROVENANCE, /export function isReusableLicence/, "the shared predicate has been removed");
  assert.match(GATE, /isReusableLicence\(/, "the ingest gate stopped using the shared predicate");
  assert.ok(
    !/REUSABLE_LICENCES\.some\(/.test(GATE),
    "licensed-source.ts is applying the allow list itself instead of calling the one predicate",
  );
  assert.equal(
    (PROVENANCE.match(/REUSABLE_LICENCES\.some\(/g) ?? []).length,
    1,
    "the allow list is being walked in more than one place in visual-provenance.ts",
  );
});

test("🔴 the gate fetches nothing — a licence is what a human read, not what a server said", () => {
  for (const forbidden of ["fetch(", "await ", "async ", "http.get", "XMLHttpRequest"]) {
    assert.ok(!GATE.includes(forbidden), `licensed-source.ts contains "${forbidden}" — the gate must stay pure`);
  }
});

test("🔴🔴 exactly one place in the codebase can mint a LicensedSource", () => {
  // The brand makes `LicensedSource` unconstructable by an object literal, so the single cast in
  // `admitSource` is the only door. A second cast anywhere would be a second door with no gate
  // behind it — and it would compile, and it would look deliberate.
  assert.equal(
    (GATE.match(/as LicensedSource/g) ?? []).length,
    1,
    "more than one place mints a LicensedSource — the brand is no longer a gate",
  );
  assert.match(GATE, /declare const LICENSED: unique symbol/, "the brand has been removed");
});
