// The RCSB resolver, driven with no network: every response shape it has to survive.

import assert from "node:assert/strict";
import test from "node:test";

import {
  rcsbEntryUrl,
  rcsbSearchUrl,
  rcsbTitleSearchUrl,
  resolveMacromolecule,
  type MacromoleculeResolveDeps,
} from "./macromolecule-resolver";

function answering(bodies: Array<{ body?: unknown; status?: number }>): MacromoleculeResolveDeps & { urls: string[] } {
  let call = 0;
  const deps = {
    fetch: async () => {
      const next = bodies[Math.min(call, bodies.length - 1)] ?? {};
      call += 1;
      const status = next.status ?? 200;
      return { json: async () => next.body, ok: status >= 200 && status < 300, status };
    },
    urls: [] as string[],
  };
  const inner = deps.fetch;
  deps.fetch = (async (url: string) => {
    deps.urls.push(url);
    return inner();
  }) as never;
  return deps;
}

const FOUND = { result_set: [{ identifier: "1mbn", score: 1 }] };
const TITLED = { struct: { title: "  The stereochemistry of the protein myoglobin  " } };

test("the search URLs carry the name, and the preferred one asks titles oldest-first", () => {
  const title = decodeURIComponent(rcsbTitleSearchUrl("green fluorescent protein"));
  assert.match(title, /struct\.title/);
  assert.match(title, /contains_phrase/);
  assert.match(title, /green fluorescent protein/);
  assert.match(title, /initial_release_date/);
  assert.match(title, /"direction":"asc"/);
  const fallback = decodeURIComponent(rcsbSearchUrl("green fluorescent protein"));
  assert.match(fallback, /full_text/);
  assert.match(fallback, /"rows":1/);
  assert.equal(rcsbEntryUrl("1MBN"), "https://data.rcsb.org/rest/v1/core/entry/1MBN");
});

test("🔴 a name no title carries falls back to plain relevance rather than to nothing", async () => {
  // Title search: 204. Full text: found. Entry: titled.
  let call = 0;
  const deps: MacromoleculeResolveDeps & { urls: string[] } = {
    fetch: (async (url: string) => {
      deps.urls.push(url);
      call += 1;
      if (call === 1) return { json: async () => undefined, ok: false, status: 204 };
      if (call === 2) return { json: async () => FOUND, ok: true, status: 200 };
      return { json: async () => TITLED, ok: true, status: 200 };
    }) as never,
    urls: [],
  };
  const out = await resolveMacromolecule("obscurin fragment", deps);
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.structure.accession, "1MBN");
  assert.match(deps.urls[0]!, /contains_phrase/);
  assert.match(decodeURIComponent(deps.urls[1]!), /full_text/);
});

test("a resolved name carries the uppercased accession, the entry title, and the provider", async () => {
  const deps = answering([{ body: FOUND }, { body: TITLED }]);
  const out = await resolveMacromolecule("myoglobin", deps);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.structure.accession, "1MBN");
    assert.equal(out.structure.name, "myoglobin");
    assert.equal(out.structure.provider, "rcsb");
    assert.equal(out.structure.title, "The stereochemistry of the protein myoglobin");
  }
  assert.equal(deps.urls.length, 2);
});

test("🔴 204 is 'nothing matched', not an error — RCSB answers an empty result with No Content", async () => {
  const out = await resolveMacromolecule("zzzz", answering([{ status: 204 }]));
  assert.equal(out.ok === false && out.reason, "not-found");
});

test("an empty result set and a missing identifier both read as not-found", async () => {
  for (const body of [{}, { result_set: [] }, { result_set: [{}] }, { result_set: [{ identifier: "  " }] }]) {
    const out = await resolveMacromolecule("x", answering([{ body }]));
    assert.equal(out.ok === false && out.reason, "not-found");
  }
});

test("🔴 the search's own answer is validated before it can reach a data URL", async () => {
  // A grouped or malformed identifier ("AF_AFP69905F1", "../../etc") must refuse, never interpolate.
  for (const identifier of ["AF_AFP69905F1", "../4HHB", "ABCD", "12345"]) {
    const out = await resolveMacromolecule("x", answering([{ body: { result_set: [{ identifier }] } }]));
    assert.equal(out.ok === false && out.reason, "no-usable-structure", identifier);
  }
});

test("a server error and a thrown fetch are provider-unreachable, never not-found", async () => {
  const erroring = await resolveMacromolecule("x", answering([{ status: 503 }]));
  assert.equal(erroring.ok === false && erroring.reason, "provider-unreachable");
  const throwing = await resolveMacromolecule("x", {
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(throwing.ok === false && throwing.reason, "provider-unreachable");
});

test("a failed title fetch costs the title and never the accession", async () => {
  const out = await resolveMacromolecule("myoglobin", answering([{ body: FOUND }, { status: 500 }]));
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.structure.accession, "1MBN");
    assert.equal(out.structure.title, undefined);
  }
});

test("an empty name refuses before any network is touched", async () => {
  const deps = answering([{ body: FOUND }]);
  const out = await resolveMacromolecule("   ", deps);
  assert.equal(out.ok === false && out.reason, "empty-name");
  assert.equal(deps.urls.length, 0);
});
