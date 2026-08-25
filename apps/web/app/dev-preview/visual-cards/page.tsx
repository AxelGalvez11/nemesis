"use client";

// DEV-ONLY PREVIEW — the semantic visuals, one per card, with no model in the loop.
//
// 🔴 WHY THIS EXISTS SEPARATELY FROM /dev-preview/visual-lab. That harness answers "what did the
// ladder DECIDE for this concept, and why" — it asks the router, which needs the network and an
// account. This one answers "what does the renderer DRAW for this spec", which needs neither. The
// specs below are written here by hand and handed straight to `SemanticVisual`, the same component
// the Canvas mounts, so what appears is exactly what a learner sees.
//
// That distinction is the whole point: every seeded state in /dev-preview/learn parks behind a
// Continue because advancing the canvas calls a model, and a signed-out harness cannot. A visual
// does not need a model to be DRAWN — only to be CHOSEN. So this surface can show the drawing.
//
// It is also where the marketing screenshots on the landing page come from, which is why the
// examples are real rather than lorem: a plot of an actual exponential decay with the numbers
// consistent, a triangle whose stated angles sum to 180, an equation that type-sets, and aspirin's
// real SMILES. A screenshot of a fake figure would be the same failure as the animated mock the
// landing page just removed.
//
// ?only=<id> renders a single card, which is what the capture script uses to shoot them one at a
// time at a tight crop. The query string is read off `window` after mount, following the
// convention the other dev-preview surfaces set.

import { useEffect, useState } from "react";

import { SemanticVisual } from "@/components/workspace/learn/semantic-visual";
import type { CanvasVisualRequest } from "@/lib/learn/canvas-visual";

interface Card {
  readonly id: string;
  readonly note: string;
  readonly visual: CanvasVisualRequest;
}

/** First-order decay, sampled every half-life. Each y is exactly half the last. */
const DECAY = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].map((x) => ({
  x,
  y: Number((100 * Math.pow(0.5, x)).toFixed(2)),
}));

/** The same drug at double the dose: identical half-life, twice the starting concentration. */
const DECAY_2X = DECAY.map((p) => ({ x: p.x, y: Number((p.y * 2).toFixed(2)) }));

const CARDS: readonly Card[] = [
  {
    id: "plot",
    note: "quantitative — two series, shared axes",
    visual: {
      kind: "quantitative",
      learningGoal:
        "Half-life does not depend on dose: doubling the starting concentration doubles every point but never moves the time axis.",
      caption: "Plasma concentration against time, at two starting doses.",
      xLabel: "hours",
      yLabel: "mg/L",
      series: [
        { label: "standard dose", points: DECAY },
        { label: "double dose", points: DECAY_2X },
      ],
    },
  },
  {
    id: "equation",
    note: "equation — LaTeX, type-set by KaTeX",
    visual: {
      kind: "equation",
      learningGoal: "The concentration falls by a constant fraction per unit time, not a constant amount.",
      caption: "First-order elimination.",
      latex: "C(t) = C_0 e^{-kt} \\qquad t_{1/2} = \\frac{\\ln 2}{k}",
    },
  },
  {
    id: "construction",
    note: "construction — points, segments and verified angles",
    visual: {
      kind: "construction",
      learningGoal:
        "In a right triangle the two non-right angles are complementary, so knowing one gives the other.",
      caption: "A 3–4–5 triangle, with its angles.",
      points: [
        { id: "A", x: 0, y: 0, label: "A" },
        { id: "B", x: 4, y: 0, label: "B" },
        { id: "C", x: 0, y: 3, label: "C" },
      ],
      segments: [
        { from: "A", to: "B", label: "4" },
        { from: "A", to: "C", label: "3" },
        { from: "B", to: "C", label: "5" },
      ],
      angles: [
        { at: "A", from: "B", to: "C", degrees: 90 },
        { at: "B", from: "A", to: "C", degrees: 36.87 },
        { at: "C", from: "A", to: "B", degrees: 53.13 },
      ],
    },
  },
  {
    id: "structure",
    note: "structure — drawn from canonical SMILES, never from model geometry",
    visual: {
      kind: "structure",
      learningGoal: "Aspirin is salicylic acid with its phenol acetylated — that ester is the whole difference.",
      caption: "Acetylsalicylic acid.",
      notation: "smiles",
      value: "CC(=O)Oc1ccccc1C(=O)O",
    },
  },
  {
    id: "relationship",
    note: "relationship — a causal chain, laid out rather than authored",
    visual: {
      kind: "relationship",
      learningGoal: "Each step causes the next; blocking any one of them stops the contraction.",
      caption: "Excitation–contraction coupling.",
      nodes: [
        { id: "n1", label: "action potential" },
        { id: "n2", label: "L-type Ca²⁺ channels open" },
        { id: "n3", label: "Ca²⁺ enters the cell" },
        { id: "n4", label: "sarcoplasmic reticulum releases Ca²⁺" },
        { id: "n5", label: "myofilaments contract" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n4" },
        { from: "n4", to: "n5" },
      ],
    },
  },
  {
    id: "table",
    note: "table \u00b7 every stated total is recomputed before it draws",
    visual: {
      kind: "table",
      learningGoal: "A balance sheet balances because the totals are derived, not asserted.",
      caption: "Current assets at period end.",
      columns: [
        { key: "item", label: "Item" },
        { key: "amount", label: "Amount", numeric: true },
      ],
      rows: [
        { cells: { item: "Cash", amount: 4200 } },
        { cells: { item: "Inventory", amount: 3100 } },
        { cells: { item: "Equipment", amount: 8700 } },
      ],
      totals: [{ column: "amount", value: 16000 }],
    },
  },
  {
    id: "timeline",
    note: "timeline \u00b7 moments and spans on one axis",
    visual: {
      kind: "timeline",
      learningGoal: "The war runs alongside the documents rather than after them.",
      caption: "The American revolutionary period.",
      unit: "year",
      events: [
        { at: 1765, label: "Stamp Act" },
        { at: 1773, label: "Boston Tea Party" },
        { at: 1775, until: 1783, label: "Revolutionary War" },
        { at: 1776, label: "Declaration of Independence" },
        { at: 1787, label: "Constitution drafted" },
      ],
    },
  },
  {
    id: "vectors",
    note: "vectors \u00b7 the claimed equilibrium is checked, not trusted",
    visual: {
      kind: "vectors",
      learningGoal: "A block resting on a slope is in equilibrium, so the three forces must sum to zero.",
      caption: "Block at rest on a 30 degree incline.",
      bodyLabel: "block",
      axesDegrees: 30,
      vectors: [
        { label: "weight", magnitude: 100, degrees: 270, unit: "N" },
        { label: "normal", magnitude: 86.6, degrees: 60, unit: "N" },
        { label: "friction", magnitude: 50, degrees: 150, unit: "N" },
      ],
      equilibrium: true,
    },
  },
  {
    id: "code",
    note: "code \u00b7 source with a stepped trace",
    visual: {
      kind: "code",
      learningGoal: "The accumulator carries the running result between iterations; nothing else does.",
      caption: "Summing a list, one step at a time.",
      language: "python",
      source: "def total(prices):\n    running = 0\n    for p in prices:\n        running += p\n    return running",
      trace: [
        { line: 2, note: "The accumulator starts empty.", variables: [{ name: "running", value: "0" }] },
        { line: 4, note: "First price added.", variables: [{ name: "p", value: "4" }, { name: "running", value: "4" }] },
        { line: 4, note: "Second price added.", variables: [{ name: "p", value: "7" }, { name: "running", value: "11" }] },
        { line: 5, note: "The loop is done, so the accumulator is the answer.", variables: [{ name: "running", value: "11" }] },
      ],
    },
  },
];

export default function VisualCardsPreview() {
  const [only, setOnly] = useState<string | null>(null);

  useEffect(() => {
    setOnly(new URLSearchParams(window.location.search).get("only"));
  }, []);

  const shown = only ? CARDS.filter((c) => c.id === only) : CARDS;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      {only ? null : (
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-(--ui-text-primary)">Semantic visuals</h1>
          <p className="text-sm text-(--ui-text-tertiary)">
            The real renderer, fed hand-written specs. No model, no network.
          </p>
        </header>
      )}

      {shown.map((card) => (
        <section className="flex flex-col gap-2" data-card={card.id} key={card.id}>
          {only ? null : (
            <p className="font-mono text-[11px] uppercase tracking-wider text-(--ui-text-tertiary)">
              {card.note}
            </p>
          )}
          <SemanticVisual visual={card.visual} />
        </section>
      ))}
    </main>
  );
}
