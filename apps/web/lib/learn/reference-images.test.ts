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
  allowedAssetUrl,
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
  // And for a bounded rendition, so an <img> never receives a 40MB original.
  assert.match(url, /iiurlwidth=1024/);
});

test("the bounded rendition is preferred over the original, which stays available as fallback", async () => {
  const body = commonsResponse([{ Artist: { value: "A" }, LicenseShortName: { value: "CC BY 4.0" } }]);
  const page = body.query.pages[0]!.imageinfo[0]! as Record<string, unknown>;
  page.thumburl = "https://upload.wikimedia.org/thumb/example0-1024.png";
  const found = await searchCommons({ concept: "nephron" }, answering(body));
  assert.equal(at(found).assetPath, "https://upload.wikimedia.org/thumb/example0-1024.png");

  const bare = await searchCommons(
    { concept: "nephron" },
    answering(commonsResponse([{ Artist: { value: "A" }, LicenseShortName: { value: "CC BY 4.0" } }])),
  );
  assert.equal(at(bare).assetPath, "https://upload.wikimedia.org/example0.png");
});

test("🔴 the asset host allow list admits the repository's file store and nothing else", () => {
  assert.equal(allowedAssetUrl("https://upload.wikimedia.org/wikipedia/commons/a/b.png"), true);
  for (const url of [
    "http://upload.wikimedia.org/a.png", // https only — a mixed-content <img> is a downgrade
    "https://upload.wikimedia.org.evil.example/a.png",
    "https://evil.example/upload.wikimedia.org/a.png",
    "https://commons.wikimedia.org/wiki/File:A.png", // a page is not pixels
    "not a url",
    "",
  ]) {
    assert.equal(allowedAssetUrl(url), false, `${url} should be refused`);
  }
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

test("🔴 the shipped registry is seeded, and every row still claims a licence somebody verified", () => {
  // This asserted emptiness until 2026-08-23, because the environment §42 was authored in could
  // not open a single file page. The registry was then seeded through
  // `scripts/reference-registry-harvest.mts`, which reads each file's own licence through the
  // repository API and refuses to emit rows it cannot verify. The row-by-row rules — reusable
  // licence, credit kept, allowed host — live in `reference-registry.test.ts`.
  assert.ok(REFERENCE_REGISTRY.length > 0, "the shipped registry has lost its rows");
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

test("🔴 a specific word outweighs a generic one — measured on the shelf's own failure case", () => {
  const rows: readonly CuratedEntry[] = [
    {
      assetPath: "registry/dna.png",
      attribution: "A",
      caption: "The DNA double helix.",
      concepts: ["dna structure", "double helix"],
      licence: "public-domain",
      source: "x",
    },
    {
      assetPath: "registry/phage.png",
      attribution: "B",
      caption: "The structure of a bacteriophage.",
      concepts: ["bacteriophage structure diagram"],
      licence: "public-domain",
      source: "x",
    },
  ];
  // Word-count scoring tied these and let arrival order pick the DNA row; the DNA row now also
  // fails the coverage rule outright (one generic shared word of a two-word request).
  const found = searchCurated({ concept: "bacteriophage structure" }, rows);
  assert.equal(found.length, 1);
  assert.equal(at(found).assetPath, "registry/phage.png");
});

test("🔴 one shared word cannot win a multi-word request — the live provider gets it instead", () => {
  const rows: readonly CuratedEntry[] = [
    {
      assetPath: "registry/bathtub.png",
      attribution: "A",
      caption: "A bathtub balance seat.",
      concepts: ["bathtub balance seat"],
      licence: "public-domain",
      source: "x",
    },
  ];
  // "balance" alone matched this row and, being curated, it outranked every live result for an
  // accounting query. Two-word requests now need two matched words or most of the asked characters.
  assert.deepEqual(searchCurated({ concept: "balance sheet" }, rows), []);
  // The row is still perfectly findable by what it actually is.
  assert.equal(searchCurated({ concept: "bathtub balance seat" }, rows).length, 1);
  // And a single-word query still matches its word outright.
  assert.equal(searchCurated({ concept: "bathtub" }, rows).length, 1);
});
