// Every visual Nemesis can put on a Canvas, rendered by the real components.
//
//   pnpm --filter @nemesis/web exec tsx --tsconfig tsconfig.render.json scripts/visual-gallery.mts out.png
//
// 🔴 EVERY PANEL GOES THROUGH THE PRODUCTION PATH. Each spec is validated by
// `validateCanvasVisual`, routed by `routeVisual`, and drawn by `SemanticVisual` — the same three
// steps a lesson takes. A gallery that hand-built its own markup would be a picture of the Canvas
// rather than the Canvas, and would keep looking right after the real thing stopped.
//
// 🔴 WHAT IS SCAFFOLDING AND WHAT IS REAL, SAID PLAINLY. The SVG shapes carry their own geometry and
// colours and are exactly what a learner sees. Spacing on the table and the code block comes from
// Tailwind classes, and Tailwind is not built here — the stylesheet below stands in for it, so
// padding and type scale are approximate while every number, coordinate and label is not.
//
// 🔴 CHEMISTRY IS ABSENT FROM THIS PAGE ON PURPOSE. `ChemicalStructure` draws inside an effect,
// because the depiction library needs a live DOM; server-rendering it yields an empty frame. Faking
// it here by calling the library directly would be this file drawing the molecule rather than the
// component. It is covered instead by checks 12–17 of `visual-ladder-acceptance.mts`, which drive a
// real browser.

import { writeFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";

import { SemanticVisual } from "@/components/workspace/learn/semantic-visual";
import { validateCanvasVisual, type CanvasVisualRequest } from "@/lib/learn/canvas-visual";
import { curve, distributionCurve, sampledHistogram } from "@/lib/learn/computed-series";
import { routeVisual } from "@/lib/learn/visual-route";

const out = process.argv[2] ?? "gallery.png";

/** A curve computed the way §45 computes one, so the plot panel is genuinely generated. */
const parabola = curve({ expression: "x^2 - 2*x - 3", from: -3, to: 5 });
const bell = distributionCurve({ kind: "normal", mean: 100, sd: 15 }, 50, 150);
const simulation = sampledHistogram({ kind: "binomial", probability: 0.5, trials: 20 }, 600, 42, 14);
if (!parabola.ok || !bell.ok || !simulation.ok) throw new Error("a computed series was refused");

const PANELS: Array<{ note: string; request: unknown; title: string }> = [
  {
    note: "KaTeX. Shipped long before this work.",
    request: {
      caption: "The quadratic formula",
      kind: "equation",
      latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      learningGoal: "Recall how the roots are found",
    },
    title: "equation",
  },
  {
    note: "Arrowhead for increases, bar for decreases. The polarity is the only thing added for pathways.",
    request: {
      caption: "A signalling cascade with one inhibitor",
      edges: [
        { from: "ligand", label: "binds", to: "receptor" },
        { from: "receptor", polarity: "increases", to: "kinase" },
        { from: "drug", polarity: "decreases", to: "kinase" },
        { from: "kinase", polarity: "increases", to: "tf" },
      ],
      kind: "relationship",
      learningGoal: "Follow what activates and what blocks",
      nodes: [
        { id: "ligand", label: "Ligand" },
        { id: "receptor", label: "Receptor" },
        { id: "drug", label: "Inhibitor" },
        { id: "kinase", label: "Kinase" },
        { id: "tf", label: "Transcription factor" },
      ],
    },
    title: "relationship",
  },
  {
    note: `Computed from "x^2 - 2x - 3" by §45 — ${parabola.value[0].points.length} points, not typed out.`,
    request: {
      caption: "Where does this cross the x axis?",
      kind: "quantitative",
      learningGoal: "Read the roots off the curve",
      series: parabola.value.map((segment) => ({ label: "x² − 2x − 3", points: segment.points })),
      xLabel: "x",
      yLabel: "f(x)",
    },
    title: "quantitative — a computed function",
  },
  {
    note: "A normal density, computed rather than sketched.",
    request: {
      caption: "IQ-scaled scores, mean 100, sd 15",
      kind: "quantitative",
      learningGoal: "See where most of a normal distribution sits",
      series: [{ label: "density", points: bell.value[0].points }],
      xLabel: "score",
      yLabel: "density",
    },
    title: "quantitative — a distribution",
  },
  {
    note: `600 draws from binomial(20, 0.5), seed ${simulation.value.seed}. Identical every time it is asked for.`,
    request: {
      caption: "Twenty coin flips, six hundred times",
      kind: "quantitative",
      learningGoal: "See sampling variation around the expected count",
      series: [{ label: "count", points: simulation.value.points }],
      xLabel: "heads",
      yLabel: "times seen",
    },
    title: "quantitative — a seeded simulation",
  },
  {
    note: "The balance was recomputed before this drew. Out by a penny and there would be no picture.",
    request: {
      balance: { left: "debit", right: "credit" },
      caption: "Equipment purchased for $20,000 cash",
      columns: [
        { key: "account", label: "Account" },
        { key: "debit", label: "Debit", numeric: true },
        { key: "credit", label: "Credit", numeric: true },
      ],
      hidden: { column: "credit", row: 1 },
      kind: "table",
      learningGoal: "See both sides of the entry",
      rows: [
        { cells: { account: "Equipment", debit: 20000 } },
        { cells: { account: "Cash", credit: 20000 } },
      ],
      totals: [{ column: "debit", value: 20000 }, { column: "credit", value: 20000 }],
    },
    title: "table — with one cell hidden for retrieval",
  },
  {
    note: "Positions are numbers and labels are text, so BCE needs no calendar. The faint marker is an uncertain date.",
    request: {
      caption: "The end of the Roman Republic",
      events: [
        { at: -49, atLabel: "49 BCE", label: "Rubicon" },
        { at: -44, atLabel: "44 BCE", label: "Caesar killed" },
        { at: -31, atLabel: "31 BCE", label: "Actium", uncertain: true },
        { at: -27, atLabel: "27 BCE", label: "Principate", until: -14 },
      ],
      kind: "timeline",
      learningGoal: "Place the events in order",
      unit: "years",
    },
    title: "timeline",
  },
  {
    note: "The 90° label was checked against the coordinates. Label it 30° and it is refused.",
    request: {
      angles: [{ at: "A", degrees: 90, from: "B", to: "C" }],
      caption: "A 3–4–5 triangle",
      kind: "construction",
      learningGoal: "Identify the right angle",
      points: [
        { id: "A", label: "A", x: 0, y: 0 },
        { id: "B", label: "B", x: 4, y: 0 },
        { id: "C", label: "C", x: 0, y: 3 },
      ],
      segments: [{ from: "A", to: "B", label: "4" }, { from: "B", to: "C", label: "5" }, { from: "C", to: "A", label: "3" }],
    },
    title: "construction",
  },
  {
    note: "These forces were resolved before drawing. If they did not cancel, no picture.",
    request: {
      axesDegrees: 30,
      bodyLabel: "10 kg block",
      caption: "A block at rest on a 30° incline",
      equilibrium: true,
      kind: "vectors",
      learningGoal: "See which forces cancel",
      vectors: [
        { degrees: 270, label: "Weight", magnitude: 98, unit: "N" },
        { degrees: 60, label: "Normal", magnitude: 84.87, unit: "N" },
        { degrees: 150, label: "Friction", magnitude: 49, unit: "N" },
      ],
    },
    title: "vectors",
  },
  {
    note: "The walkthrough is labelled as written rather than executed. Nothing here runs code.",
    request: {
      caption: "An accumulator loop",
      kind: "code",
      language: "python",
      learningGoal: "Follow how total changes",
      source: "total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)",
      trace: [
        { line: 1, note: "total starts empty", variables: [{ name: "total", value: "0" }] },
        { line: 3, note: "first pass adds 1", variables: [{ name: "total", value: "1" }] },
        { line: 3, note: "then 2, then 3", variables: [{ name: "total", value: "6" }] },
        { line: 4, note: "prints the total" },
      ],
    },
    title: "code with a trace",
  },
];

/** Stands in for Tailwind and the app's theme tokens. See the header for what this does and does not do. */
const STYLES = `
:root {
  --ui-text-primary:#111418; --ui-text-secondary:#3c444d; --ui-text-tertiary:#6b747d;
  --ui-text-quaternary:#98a1aa; --ui-stroke-primary:#c9d1d9; --ui-stroke-tertiary:#e4e9ee;
  --ui-bg-secondary:#f7f9fb; --ui-bg-elevated:#eef2f6; --ui-accent:#c8102e;
  --canvas-text-body:15px; --canvas-text-meta:12px;
}
body { margin:0; background:#fff; font:15px/1.5 system-ui, sans-serif; color:var(--ui-text-primary); }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; padding:14px; }
.panel { border:1px solid var(--ui-stroke-tertiary); border-radius:12px; padding:12px; background:#fff; }
.panel h2 { margin:0 0 2px; font:600 12px/1.4 ui-monospace, monospace; color:var(--ui-accent); text-transform:uppercase; letter-spacing:.04em; }
.panel p.note { margin:0 0 8px; font-size:12px; color:var(--ui-text-tertiary); }
figure { margin:0; border:1px solid var(--ui-stroke-tertiary); border-radius:10px; background:var(--ui-bg-secondary); padding:12px; overflow:hidden; }
figcaption { margin-top:8px; font-size:12px; color:var(--ui-text-tertiary); }
table { width:100%; border-collapse:collapse; text-align:left; }
th, td { padding:6px 10px; border-bottom:1px solid var(--ui-stroke-tertiary); }
th { font-size:12px; font-weight:600; color:var(--ui-text-tertiary); }
.text-right, td.text-right, th.text-right { text-align:right; }
pre { background:var(--ui-bg-elevated); border-radius:8px; padding:10px; overflow-x:auto; font:12px/1.6 ui-monospace, monospace; margin:0; }
ol { margin:10px 0 0; padding-left:0; list-style:none; font-size:12px; }
ol li { display:flex; gap:10px; margin-bottom:3px; color:var(--ui-text-secondary); }
svg { width:100%; height:auto; display:block; }
`;

const rendered: string[] = [];
for (const panel of PANELS) {
  const validation = validateCanvasVisual(panel.request);
  if (!validation.ok) throw new Error(`${panel.title} was refused: ${validation.reason} — ${validation.detail}`);
  const route = routeVisual({ request: panel.request });
  if (route.decision !== "render") throw new Error(`${panel.title} did not route: ${route.decision}`);
  const markup = renderToStaticMarkup(<SemanticVisual visual={validation.visual as CanvasVisualRequest} />);
  rendered.push(
    `<section class="panel"><h2>${panel.title}</h2><p class="note">${panel.note}</p>${markup}</section>`,
  );
  console.log(`rendered ${panel.title} → ${route.decision}/${route.representation}`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body><div class="grid">${rendered.join("")}</div></body></html>`;

// 🔴 WRAPPED RATHER THAN TOP-LEVEL AWAIT. A `.tsx` file is compiled to CommonJS by this runner and
// top-level await is not available there; the alternative was renaming the file to `.mts`, which
// would have cost JSX. The wrapper is the smaller compromise.
void (async () => {
  const { chromium } = (await import("playwright")) as never as {
    chromium: { launch: () => Promise<{ close: () => Promise<void>; newPage: (o: unknown) => Promise<never> }> };
  };
  const browser = await chromium.launch();
  try {
    const page = (await browser.newPage({ viewport: { height: 1400, width: 1400 } })) as unknown as {
      locator: (s: string) => { screenshot: (o: { path: string }) => Promise<void> };
      setContent: (h: string) => Promise<void>;
    };
    await page.setContent(html);
    await page.locator(".grid").screenshot({ path: out });
    writeFileSync(out.replace(/\.png$/, ".html"), html, "utf8");
    console.log(`\n${PANELS.length} panels → ${out}`);
  } finally {
    await browser.close();
  }
})();
