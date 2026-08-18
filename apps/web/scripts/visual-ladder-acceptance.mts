// Does the ladder actually work? Nine claims, checked against the production router.
//
//   pnpm --filter @nemesis/web exec tsx scripts/visual-ladder-acceptance.mts
//
// 🔴 EVERY CHECK CALLS `routeVisual()`. Not a copy of it, not a re-implementation — the same
// function the Canvas asks. A harness that agreed with itself would keep passing after production
// stopped agreeing with it, which is the failure `visualization-roadmap.test.ts` was written for
// one layer up.
//
// 🔴 THE NETWORK-DEPENDENT CHECKS RUN AGAINST INJECTED RESPONSES, AND SAY SO IN THEIR OWN OUTPUT.
// `resolveStructure` and `findReferenceImages` take their `fetch` as a dependency precisely so this
// script can state the provider's answer rather than depend on a third party being up. What that
// proves is the parse, the licence mapping and the routing; what it does NOT prove is that PubChem
// and Commons return these shapes today, and no line here may claim otherwise. Pass `--live` to run
// the same checks against the real services when the machine has egress.
//
// 🔴 THE BROWSER CHECK IS THE ONE THAT PROVES "NOT GENERATED IMAGERY". Everything else is logic
// about strings. Only a real renderer turning a SMILES into <path> elements shows that the drawing
// is computed rather than imagined — and running it twice shows it is deterministic. It is skipped
// with a loud line when the depiction library is not installed, never silently.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { validateCanvasVisual } from "../lib/learn/canvas-visual.ts";
import { statesStereochemistry } from "../lib/learn/chem-notation.ts";
import { resolveStructure } from "../lib/learn/chem-resolver.ts";
import { findReferenceImages, type CuratedEntry } from "../lib/learn/reference-images.ts";
import { MEASURED_PROVIDERS, routeSpeech } from "../lib/learn/speech-route.ts";
import { chooseAsset } from "../lib/learn/visual-provenance.ts";
import { routeVisual } from "../lib/learn/visual-route.ts";

const live = process.argv.includes("--live");
let failures = 0;
let checks = 0;

function check(claim: string, passed: boolean, evidence: string): void {
  checks += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${claim}`);
  console.log(`      ${evidence}`);
}

// ── A provider that answers from a recorded shape, so the parse is what is under test ──────────
//
// The payload is PubChem's documented property-table shape. It is a FIXTURE, not a capture from a
// live call in this environment, and the SMILES in it is asserted by this script rather than
// discovered by it — which is exactly why `--live` exists.
const PUBCHEM_FIXTURE = {
  PropertyTable: {
    Properties: [{ CID: 2244, IsomericSMILES: "CC(=O)OC1=CC=CC=C1C(=O)O", MolecularFormula: "C9H8O4" }],
  },
};

const COMMONS_FIXTURE = {
  // formatversion=2, which is what `commonsUrl()` asks for: `pages` is an ARRAY, not the legacy
  // id-keyed object. Getting this wrong is silent — the parser finds no pages and the provider
  // looks like it found nothing openly licensed.
  query: {
    pages: [
      {
        title: "File:Example nephron diagram.svg",
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/example-nephron.svg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Example_nephron_diagram.svg",
            extmetadata: {
              Artist: { value: '<a href="/wiki/User:Someone">A. Someone</a>' },
              ImageDescription: { value: "Schematic of a nephron" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
              Categories: { value: "Kidney|Nephrons" },
            },
          },
        ],
      },
    ],
  },
};

function fixtureFetch(payload: unknown) {
  return async (_url: string) => ({ json: async () => payload, ok: true, status: 200 });
}

async function realFetch(url: string, init?: { signal?: AbortSignal }) {
  const response = await fetch(url, { ...init, headers: { accept: "application/json" } });
  return { json: () => response.json() as Promise<unknown>, ok: response.ok, status: response.status };
}

// ── 1. a chemical name becomes a deterministic chemical structure ───────────────────────────────

const resolution = await resolveStructure("aspirin", {
  fetch: live ? realFetch : fixtureFetch(PUBCHEM_FIXTURE),
  timeoutMs: 8000,
});

check(
  "1. a chemical name resolves to a canonical structure",
  resolution.ok,
  resolution.ok
    ? `"aspirin" → ${resolution.structure.notation}:${resolution.structure.value} (${resolution.structure.provider} id ${resolution.structure.id})${live ? " [live]" : " [fixture]"}`
    : `refused: ${resolution.reason} — ${resolution.detail}`,
);

const structureRequest = resolution.ok
  ? {
      kind: "structure" as const,
      learningGoal: "Recognise the structure of aspirin",
      notation: resolution.structure.notation,
      resolvedFrom: {
        id: resolution.structure.id,
        name: resolution.structure.name,
        provider: resolution.structure.provider,
      },
      value: resolution.structure.value,
    }
  : null;

const structureRoute = structureRequest ? routeVisual({ request: structureRequest }) : null;

check(
  "2. the router draws it deterministically rather than reaching for an image",
  structureRoute?.decision === "render" && structureRoute.representation === "structure",
  structureRoute
    ? `routeVisual → ${structureRoute.decision}${structureRoute.decision === "render" ? `/${structureRoute.representation}` : ""}: ${structureRoute.because}`
    : "no structure to route",
);

check(
  "3. the canonical representation stays inspectable on the routed spec",
  structureRoute?.decision === "render" &&
    structureRoute.representation === "structure" &&
    structureRoute.spec.value === (resolution.ok ? resolution.structure.value : "") &&
    structureRoute.spec.resolvedFrom?.provider === "pubchem",
  structureRoute?.decision === "render" && structureRoute.representation === "structure"
    ? `spec carries ${structureRoute.spec.notation}:${structureRoute.spec.value}, stamped from ${structureRoute.spec.resolvedFrom?.provider}`
    : "no spec",
);

// Stereochemistry: the isomeric form is the one asked for, and whether it carries stereocentres is
// a fact about the molecule rather than about the renderer.
const chiral = validateCanvasVisual({
  kind: "structure",
  learningGoal: "Identify the chiral centre",
  notation: "smiles",
  value: "C[C@@H](N)C(=O)O",
});
check(
  "4. stereochemistry survives the spec boundary",
  chiral.ok && chiral.visual.kind === "structure" && statesStereochemistry(chiral.visual.value),
  chiral.ok && chiral.visual.kind === "structure"
    ? `L-alanine kept its @@ through validation: ${chiral.visual.value}`
    : `refused: ${chiral.ok ? "" : chiral.detail}`,
);

// ── 2. a scientific concept returns a licensed reference candidate with attribution ─────────────

const registry: readonly CuratedEntry[] = [];
const candidates = await findReferenceImages(
  { concept: "nephron", limit: 3 },
  { fetch: live ? realFetch : fixtureFetch(COMMONS_FIXTURE), registry },
);
const licensed = candidates.find((candidate) => candidate.provenance === "reference_image");

check(
  "5. a scientific concept returns a licensed reference candidate carrying its attribution",
  Boolean(licensed?.licence?.licence && licensed?.licence?.attribution),
  licensed
    ? `${licensed.providerId} → ${licensed.licence?.licence} · ${licensed.licence?.attribution}${live ? " [live]" : " [fixture]"}`
    : `no licensed candidate among ${candidates.length}`,
);

// ── 3. generated imagery still cannot become a graded answer key ────────────────────────────────

const generatedOnly = [{ assetPath: "registry/gen.png", provenance: "generated_image" as const }];
const gradedRoute = routeVisual({ assets: generatedOnly, operation: "locate" });
const ungradedRoute = routeVisual({ assets: generatedOnly, operation: "explain" });

check(
  "6. generated imagery cannot become a graded answer key",
  gradedRoute.decision === "prose" && gradedRoute.assetRefusal === "generated-cannot-bear-accuracy",
  `locate → ${gradedRoute.decision}${gradedRoute.decision === "prose" ? `/${gradedRoute.reason}/${gradedRoute.assetRefusal}` : ""}; ` +
    `explain → ${ungradedRoute.decision}${ungradedRoute.decision === "render" ? `/${ungradedRoute.representation}` : ""}`,
);

// ── 4. the ordering holds under competition ─────────────────────────────────────────────────────

const LABELS = [
  { text: "Glomerulus", x: 0.3, y: 0.3 },
  { text: "Proximal tubule", x: 0.6, y: 0.6 },
];
const withFigure = routeVisual({
  assets: candidates,
  knowledge: {
    figure: { assetPath: "u1/nephron.png", caption: "A nephron", imageRef: "media/image1.png", labels: LABELS },
    id: "k1",
    statement: "The parts of a nephron.",
    type: "spatial",
    unanchoredProvenance: ["model"],
  },
  labelKey: "Glomerulus",
  normalizeLabel: (text: string) => text,
  operation: "locate",
});

check(
  "7. the learner's own source figure outranks an external reference",
  withFigure.decision === "render" && withFigure.representation === "source_figure",
  `with a licensed candidate also available: ${withFigure.decision}${withFigure.decision === "render" ? `/${withFigure.representation}` : ""}`,
);

const renderVsImage = structureRequest ? routeVisual({ assets: candidates, request: structureRequest }) : null;
check(
  "8. a deterministic render outranks an external image",
  renderVsImage?.decision === "render" && renderVsImage.representation === "structure",
  renderVsImage
    ? `structure request + ${candidates.length} image candidate(s) → ${renderVsImage.decision}/${renderVsImage.decision === "render" ? renderVsImage.representation : ""}`
    : "no structure to compete",
);

// A licensed image may still be graded against, where a generated one may not — the point of the
// provenance rule is the origin, not a blanket ban on external pictures.
const licensedGraded = licensed
  ? chooseAsset({ accuracyBearing: true, candidates: [licensed] })
  : { ok: false as const, detail: "no licensed candidate", reason: "no-candidates" as const };
check(
  "9. a licensed image MAY be graded against, so the rule is about origin rather than externality",
  licensedGraded.ok,
  licensedGraded.ok ? `accuracy-bearing use permitted for ${licensedGraded.asset.licence?.licence}` : licensedGraded.detail,
);

// ── 5. a target-language utterance requires a locale ────────────────────────────────────────────

const noLocale = routeSpeech({
  key: "t1",
  moment: { kind: "target_language", text: "¿Dónde está la biblioteca?" },
  purpose: "language_learning",
});
const withLocale = routeSpeech({
  key: "t2",
  moment: { kind: "target_language", text: "¿Dónde está la biblioteca?" },
  purpose: "language_learning",
  targetLocale: "es-MX",
});

check(
  "10. a target-language utterance is refused without a locale",
  noLocale.decision === "silent" && noLocale.reason === "locale-unknown" && withLocale.decision === "speak",
  `no locale → ${noLocale.decision}/${noLocale.decision === "silent" ? noLocale.reason : ""}; ` +
    `es-MX → ${withLocale.decision}${withLocale.decision === "speak" ? ` at ${withLocale.speed}× via ${withLocale.provider} (${withLocale.providerEvidence})` : ""}`,
);

check(
  "11. no production TTS provider has been switched on advertised coverage",
  Object.keys(MEASURED_PROVIDERS).length === 0 && withLocale.decision === "speak" && withLocale.providerEvidence === "unmeasured-default",
  `MEASURED_PROVIDERS is ${JSON.stringify(MEASURED_PROVIDERS)} — every locale reports unmeasured-default until somebody listens`,
);

// ── 6. the drawing is computed, not imagined ────────────────────────────────────────────────────

// 🔴 BOTH DEPENDENCIES ARE LOADED LAZILY AND A MISSING ONE SKIPS LOUDLY. Playwright is not a
// dependency of this package — it is what a laptop or a CI image happens to have — and the
// depiction library needs an install. Importing either at the top would make the whole harness
// unrunnable on a machine that could still check the other twelve claims.
const require = createRequire(import.meta.url);
let bundlePath: string | null = null;
try {
  // The package's `exports` map blocks deep subpaths, so resolve the package entry — which IS the
  // UMD bundle (`main` is `./dist/smiles-drawer.min.js`) — rather than reaching past it.
  bundlePath = require.resolve("smiles-drawer");
} catch {
  bundlePath = null;
}

let chromium: { launch: () => Promise<{ close: () => Promise<void>; newPage: () => Promise<never> }> } | null = null;
try {
  ({ chromium } = (await import("playwright")) as never);
} catch {
  chromium = null;
}

if (!bundlePath || !chromium) {
  console.log("SKIP  12-13. deterministic geometry from the real renderer");
  console.log(`      ${!bundlePath ? "smiles-drawer is not installed" : "playwright is not available"} — the drawing itself was not exercised`);
} else {
  const bundle = readFileSync(bundlePath, "utf8");
  const smiles = resolution.ok ? resolution.structure.value : "CC(=O)OC1=CC=CC=C1C(=O)O";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: bundle });
    // 🔴 THE BROWSER CODE IS A STRING, NOT A CLOSURE, AND THAT IS NOT A STYLE CHOICE. This script
    // runs under tsx, whose transform injects an esbuild helper (`__name`) into every function it
    // compiles — including one handed to `page.evaluate`, where the helper does not exist and the
    // page throws `__name is not defined`. Passing source text keeps the transform out of the
    // browser entirely.
    //
    // 🔴 BONDS ARE `<line>`, NOT `<path>`, AND THIS WAS MEASURED RATHER THAN ASSUMED. An earlier
    // version of this check counted `<path>` and reported zero for a picture that was drawing
    // perfectly — the depiction library emits `<line>` per bond stroke, plus `<text>` per labelled
    // atom. A geometry check that counts the wrong element fails a working renderer, which is worse
    // than not checking.
    const probe = `(() => {
      const draw = (value) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "480");
        svg.setAttribute("height", "360");
        document.body.appendChild(svg);
        const drawer = new SmilesDrawer.SvgDrawer({ height: 360, width: 480 });
        drawer.draw(SmilesDrawer.Parser.parse(value), svg, "light");
        return svg;
      };
      const shape = (svg) => {
        const hist = {};
        svg.querySelectorAll("*").forEach((node) => { hist[node.tagName] = (hist[node.tagName] || 0) + 1; });
        return hist;
      };
      // Identity is compared on GEOMETRY, not on markup: the library mints a random gradient id per
      // render, so two identical drawings never have identical outerHTML. The bond coordinates are
      // the thing that must not move.
      const geometry = (svg) => [...svg.querySelectorAll("line")]
        .map((line) => ["x1", "y1", "x2", "y2"].map((a) => line.getAttribute(a)).join(","))
        .join(" ");
      const first = draw(${JSON.stringify(smiles)});
      const second = draw(${JSON.stringify(smiles)});
      const chiral = draw("C[C@@H](N)C(=O)O");
      const flat = draw("CC(N)C(=O)O");
      return {
        deterministic: geometry(first) === geometry(second),
        bonds: shape(first).line || 0,
        atomLabels: shape(first).text || 0,
        chiralBonds: shape(chiral).line || 0,
        flatBonds: shape(flat).line || 0,
        stereoChangesTheDrawing: geometry(chiral) !== geometry(flat),
      };
    })()`;
    const result = (await page.evaluate(probe)) as {
      atomLabels: number;
      bonds: number;
      chiralBonds: number;
      deterministic: boolean;
      flatBonds: number;
      stereoChangesTheDrawing: boolean;
    };

    check(
      "12. the structure is DRAWN from its notation — real vector geometry, identical on a re-run",
      result.bonds > 0 && result.deterministic,
      `aspirin drew ${result.bonds} bond strokes and ${result.atomLabels} atom labels, with identical ` +
        `coordinates across two renders — computed geometry, not an image model's impression`,
    );
    check(
      "13. a stereocentre reaches the drawing",
      result.stereoChangesTheDrawing && result.chiralBonds > result.flatBonds,
      `L-alanine drew ${result.chiralBonds} bond strokes against ${result.flatBonds} for the same ` +
        `molecule written without stereochemistry — the wedge is in the picture, not just in the string`,
    );
  } finally {
    await browser.close();
  }
}

console.log("");
console.log(`${checks - failures}/${checks} checks passed${live ? " (live providers)" : " (injected provider responses)"}`);
if (failures > 0) process.exitCode = 1;
