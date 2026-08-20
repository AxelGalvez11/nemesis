// Finding a picture, and refusing to call one usable when its licence is not.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a non-commercial licence is not admitted by a prefix match`.
// `startsWith("CC BY")` is the change somebody would make to "support more licences", it looks
// obviously correct, and it silently admits `CC BY-NC` — which forbids the commercial use Nemesis
// is. That is a legal failure no other test in this repo would catch.

import assert from "node:assert/strict";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import {
  commonsUrl,
  findReferenceImages,
  normaliseLicence,
  plainText,
  searchCommons,
  searchCurated,
  type CuratedEntry,
} from "./reference-images";
import { REFERENCE_REGISTRY } from "./reference-registry";
import { chooseAsset, creditLineFor } from "./visual-provenance";

/** A response in the shape Wikimedia's imageinfo generator actually returns. */
function commonsResponse(files: Array<Record<string, unknown>>) {
  return {
    query: {
      pages: files.map((file, index) => ({
        imageinfo: [
          {
            descriptionurl: `https://commons.wikimedia.org/wiki/File:Example${index}.png`,
            extmetadata: file,
            url: `https://upload.wikimedia.org/example${index}.png`,
          },
        ],
        title: `File:Example${index}.png`,
      })),
    },
  };
}

function answering(body: unknown, ok = true) {
  return { fetch: async () => ({ json: async () => body, ok, status: ok ? 200 : 500 }) };
}

const CURATED: readonly CuratedEntry[] = [
  {
    assetPath: "registry/nephron.png",
    attribution: "A. Author, An Open Textbook",
    caption: "A nephron with its tubule segments labelled.",
    concepts: ["nephron", "kidney tubule"],
    licence: "CC-BY-4.0",
    source: "An open textbook programme",
  },
  {
    assetPath: "registry/lever.png",
    attribution: "Public domain, a government archive",
    caption: "Three classes of lever.",
    concepts: ["lever", "fulcrum", "mechanical advantage"],
    licence: "public-domain",
    source: "A government archive",
  },
];

// ───────────────────────────────────────────────────────────── licences

test("🔴 a non-commercial licence is not admitted by a prefix match", () => {
  // The change that would break this is `startsWith("CC BY")`, and it looks obviously correct.
  assert.equal(normaliseLicence("CC BY-NC 4.0"), null);
  assert.equal(normaliseLicence("CC BY-NC-SA 4.0"), null);
  assert.equal(normaliseLicence("CC BY-ND 4.0"), null);
});

test("the three spellings of one licence reach one identifier", () => {
  for (const spelling of ["CC BY-SA 4.0", "CC-BY-SA-4.0", "cc by sa 4.0", "  CC BY SA 4.0 "]) {
    assert.equal(normaliseLicence(spelling), "CC-BY-SA-4.0", `${spelling} did not normalise`);
  }
});

test("an unrecognised licence becomes no licence rather than a guess", () => {
  for (const unknown of ["All rights reserved", "Fair use", "GFDL", "", null, undefined, 42]) {
    assert.equal(normaliseLicence(unknown), null);
  }
});

test("author fields arrive as HTML and are flattened to text", () => {
  assert.equal(plainText('<a href="/wiki/User:X" title="X">Jane Doe</a>'), "Jane Doe");
  assert.equal(plainText("<span>A &amp; B</span>"), "A B");
  assert.equal(plainText(""), undefined);
});

// ───────────────────────────────────────────────────────────── the live provider

test("🔴 the search asks for files, not articles", () => {
  // Without the file namespace the generator returns wiki articles, which carry no licence and no
  // pixels — every result would be discarded and the provider would look like it found nothing.
  const url = commonsUrl({ concept: "nephron" });
  assert.match(url, /gsrnamespace=6/);
  assert.match(url, /iiprop=url%7Cextmetadata/);
  assert.match(url, /gsrsearch=nephron/);
});

test("a file whose licence is reusable becomes a candidate carrying its credit", async () => {
  const found = await searchCommons({ concept: "nephron" }, answering(commonsResponse([
    {
      Artist: { value: '<a href="#">J. Author</a>' },
      ImageDescription: { value: "A labelled nephron." },
      LicenseShortName: { value: "CC BY 4.0" },
    },
  ])));
  assert.equal(found.length, 1);
  assert.equal(at(found).licence?.licence, "CC-BY-4.0");
  assert.equal(at(found).licence?.attribution, "J. Author");
  assert.equal(at(found).provenance, "reference_image");
  assert.equal(at(found).providerId, "wikimedia-commons");
});

test("🔴 a file whose licence is not reusable is dropped here, not passed on unlicensed", async () => {
  // Passing it on would make the refusal read as a bookkeeping failure when it is really "this file
  // is not openly licensed".
  const found = await searchCommons({ concept: "nephron" }, answering(commonsResponse([
    { Artist: { value: "Somebody" }, LicenseShortName: { value: "CC BY-NC 4.0" } },
    { Artist: { value: "Somebody else" }, LicenseShortName: { value: "CC BY 4.0" } },
  ])));
  assert.equal(found.length, 1);
  assert.equal(at(found).licence?.licence, "CC-BY-4.0");
});

test("a provider that errors returns nothing rather than throwing into the teaching path", async () => {
  assert.deepEqual(await searchCommons({ concept: "x" }, answering({}, false)), []);
  assert.deepEqual(await searchCommons({ concept: "x" }, { fetch: async () => { throw new Error("offline"); } }), []);
  assert.deepEqual(await searchCommons({ concept: "x" }, {}), []);
});

// ───────────────────────────────────────────────────────────── the curated provider

test("a curated row matches on concept overlap and carries everything needed to show it", () => {
  const found = searchCurated({ concept: "nephron tubule" }, CURATED);
  assert.equal(found.length, 1);
  assert.equal(at(found).licence?.attribution, "A. Author, An Open Textbook");
  assert.equal(creditLineFor(at(found)), "A. Author, An Open Textbook · CC-BY-4.0");
});

test("🔴 the shipped registry is empty, because no licence could be verified where this was written", () => {
  // A row is a claim about a specific file's licence. Writing one from memory is the same act §42
  // forbids everywhere else in the ladder.
  assert.deepEqual(REFERENCE_REGISTRY, []);
});

test("🔴 a curated row and a live row both reach the ladder, curated first", async () => {
  const found = await findReferenceImages({ concept: "nephron" }, {
    ...answering(commonsResponse([{ Artist: { value: "Live" }, LicenseShortName: { value: "CC BY 4.0" } }])),
    registry: CURATED,
  });
  assert.equal(found.length, 2);
  assert.equal(at(found).providerId, "curated");
  const chosen = chooseAsset({ accuracyBearing: true, candidates: found });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.ok && chosen.asset.assetPath, "registry/nephron.png");
});

test("a concept nothing matches returns no candidates, which the ladder reports by name", async () => {
  const found = await findReferenceImages({ concept: "zzzz" }, { registry: CURATED });
  assert.deepEqual(found, []);
  const chosen = chooseAsset({ accuracyBearing: true, candidates: found });
  assert.equal(chosen.ok === false && chosen.reason, "no-candidates");
});

test("🔴 a candidate found here still passes through the ladder's own licence rules", async () => {
  // The provider is not trusted to have got it right; `chooseAsset` re-checks.
  const found = searchCurated({ concept: "lever" }, [
    { ...at(CURATED, 1), attribution: "", licence: "CC-BY-4.0" },
  ]);
  const chosen = chooseAsset({ accuracyBearing: false, candidates: found });
  assert.equal(chosen.ok, false);
  assert.equal(chosen.ok === false && chosen.reason, "attribution-missing");
});
