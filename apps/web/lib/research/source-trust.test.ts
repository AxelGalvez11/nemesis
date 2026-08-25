import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { byRank, citable, hostMatchesDomain, rankSource } from "./source-trust";

// The regression this whole module exists to prevent, stated as a test rather than a comment.

test("🔴 the sources the old allowlist deleted are all citable now", () => {
  // Each of these was scored "low" by web-research.ts's webTrust() and dropped before the model
  // saw it, because none of them appears in a list of medical publishers. Together they are most of
  // the scholarly web outside medicine.
  const deleted = [
    "https://ieeexplore.ieee.org/document/1234567", // an engineering student's entire literature
    "https://www.jstor.org/stable/1234567", // a historian's
    "https://www.cambridge.org/core/journals/x/article/y",
    "https://academic.oup.com/journal/article/1/2/3",
    "https://www.courtlistener.com/opinion/123/united-states-v-lopez/",
    "https://asmedigitalcollection.asme.org/article/1/2",
    "https://dl.acm.org/doi/10.1145/1234",
    "https://www.tandfonline.com/doi/full/10.1080/1234",
  ];
  for (const url of deleted) {
    assert.ok(citable(url), `${url} is still being thrown away`);
  }
});

test("🔴 no allowlist survived anywhere in the module", () => {
  // The cheapest way for this to regress is somebody "fixing" one thin report by adding the handful
  // of domains that would have helped that one question. Then we are back where we started, one
  // field at a time. If a named publisher ever appears in the CODE, that is what happened.
  //
  // Comment lines are skipped, because the header has to name the publishers it is explaining the
  // removal of — and this test caught that on its first run, which is the behaviour I wanted.
  const code = readFileSync(new URL("./source-trust.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*"));
    })
    .join("\n");
  for (const publisher of ["nejm", "thelancet", "cochrane", "jamanetwork", "uptodate", "ieee", "jstor", "sciencedirect"]) {
    assert.ok(
      !new RegExp(`"[^"]*${publisher}[^"]*"`, "i").test(code),
      `🔴 "${publisher}" is named in a list — the allowlist is growing back`,
    );
  }
});

test("a page shape with no primary information in any field is refused", () => {
  for (const url of ["https://www.chegg.com/q/1", "https://quizlet.com/deck/2", "https://www.pinterest.com/pin/3"]) {
    assert.ok(!citable(url), `${url} should not be citable`);
  }
  // And the refusal is subject-neutral: it is about the page being an aggregator, not about topic.
  assert.ok(citable("https://en.wikipedia.org/wiki/Commerce_Clause"));
  assert.ok(citable("https://example.com/some/ordinary/page"));
});

test("a nonsense address is not citable rather than crashing", () => {
  assert.ok(!citable("not a url"));
  assert.ok(!citable(""));
  assert.equal(rankSource("not a url").rank, "ordinary");
});

test("🔴 rank is earned structurally, so it works in a field nobody thought about", () => {
  // A registered identifier: the resolver is named, never the publisher, so this covers every
  // journal that has ever minted a DOI including ones that do not exist yet.
  assert.equal(rankSource("https://doi.org/10.1017/S0022381600001234").rank, "primary");
  assert.equal(rankSource("https://arxiv.org/abs/2401.00001").rank, "primary");
  assert.equal(rankSource("https://ssrn.com/abstract=123").rank, "primary");
  // An institution stands behind it — recognisable from the shape of the name in any country.
  assert.equal(rankSource("https://www.law.cornell.edu/wex/commerce_clause").rank, "primary");
  assert.equal(rankSource("https://www.legislation.gov.uk/ukpga/1998/42").rank, "primary");
  assert.equal(rankSource("https://eur-lex.europa.eu/eli/reg/2016/679/oj").rank, "primary");
  assert.equal(rankSource("https://www.nasa.gov/mission/artemis").rank, "primary");
  // Orientation, and it says so itself.
  assert.equal(rankSource("https://en.wikipedia.org/wiki/Fourier_transform").rank, "reference");
  // Everything else is judged on its text, not its address.
  assert.equal(rankSource("https://someblog.example/post").rank, "ordinary");
});

test("a spoofed host cannot borrow an institution's rank", () => {
  // The predecessor used host.includes(), so "cornell.edu.attacker.example" read as a university.
  assert.equal(rankSource("https://cornell.edu.attacker.example/page").rank, "ordinary");
  assert.equal(rankSource("https://doi.org.attacker.example/10.1/x").rank, "ordinary");
  assert.ok(!hostMatchesDomain("notdoi.org", "doi.org"), "a domain that merely ends in the letters");
  assert.ok(hostMatchesDomain("sub.doi.org", "doi.org"), "a real subdomain still matches");
});

test("ranking orders the pool and never shortens it", () => {
  const pool = [
    { url: "https://someblog.example/a" },
    { url: "https://en.wikipedia.org/wiki/B" },
    { url: "https://doi.org/10.1/c" },
    { url: "https://anotherblog.example/d" },
  ];
  const sorted = byRank(pool);
  assert.equal(sorted.length, pool.length, "🔴 ranking dropped a source — rank orders, it does not gate");
  assert.deepEqual(
    sorted.map((s) => s.url),
    [
      "https://doi.org/10.1/c",
      "https://en.wikipedia.org/wiki/B",
      "https://someblog.example/a",
      "https://anotherblog.example/d",
    ],
    "equal ranks must keep the order search returned them in",
  );
});

test("every rank comes with a reason a reader could argue with", () => {
  for (const url of ["https://doi.org/10.1/x", "https://en.wikipedia.org/wiki/Y", "https://blog.example/z"]) {
    const { reason } = rankSource(url);
    assert.ok(reason.length > 20, `${url} ranked with no explanation`);
  }
});
