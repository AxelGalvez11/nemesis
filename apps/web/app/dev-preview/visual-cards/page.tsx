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
  {
    id: "surface",
    note: "surface \u00b7 a 3D plot, sampled and rendered",
    visual: {
      kind: "surface",
      learningGoal: "A product of two waves is a surface with alternating peaks and troughs, not a single hill.",
      caption: "z = sin(x) cos(y) over a six-by-six square.",
      expression: "sin(x)*cos(y)",
      xFrom: -3, xTo: 3, yFrom: -3, yTo: 3,
      xLabel: "x", yLabel: "y", zLabel: "z",
      grid: [
        [0.1397, 0.489, 0.7703, 0.9445, 0.9875, 0.8932, 0.6748, 0.3626, -0.0, -0.3626, -0.6748, -0.8932, -0.9875, -0.9445, -0.7703, -0.489, -0.1397],
        [0.1227, 0.4295, 0.6765, 0.8296, 0.8673, 0.7845, 0.5927, 0.3185, -0.0, -0.3185, -0.5927, -0.7845, -0.8673, -0.8296, -0.6765, -0.4295, -0.1227],
        [0.0886, 0.3103, 0.4888, 0.5993, 0.6266, 0.5668, 0.4282, 0.2301, -0.0, -0.2301, -0.4282, -0.5668, -0.6266, -0.5993, -0.4888, -0.3103, -0.0886],
        [0.0423, 0.1479, 0.2331, 0.2858, 0.2988, 0.2703, 0.2042, 0.1097, -0.0, -0.1097, -0.2042, -0.2703, -0.2988, -0.2858, -0.2331, -0.1479, -0.0423],
        [-0.01, -0.0349, -0.055, -0.0675, -0.0706, -0.0638, -0.0482, -0.0259, 0.0, 0.0259, 0.0482, 0.0638, 0.0706, 0.0675, 0.055, 0.0349, 0.01],
        [-0.0608, -0.213, -0.3355, -0.4114, -0.4301, -0.389, -0.2939, -0.1579, 0.0, 0.1579, 0.2939, 0.389, 0.4301, 0.4114, 0.3355, 0.213, 0.0608],
        [-0.1033, -0.3614, -0.5693, -0.6981, -0.7299, -0.6602, -0.4987, -0.268, 0.0, 0.268, 0.4987, 0.6602, 0.7299, 0.6981, 0.5693, 0.3614, 0.1033],
        [-0.1313, -0.4596, -0.724, -0.8878, -0.9282, -0.8396, -0.6343, -0.3408, 0.0, 0.3408, 0.6343, 0.8396, 0.9282, 0.8878, 0.724, 0.4596, 0.1313],
        [-0.1411, -0.4939, -0.7781, -0.9541, -0.9975, -0.9023, -0.6816, -0.3663, 0.0, 0.3663, 0.6816, 0.9023, 0.9975, 0.9541, 0.7781, 0.4939, 0.1411],
        [-0.1313, -0.4596, -0.724, -0.8878, -0.9282, -0.8396, -0.6343, -0.3408, 0.0, 0.3408, 0.6343, 0.8396, 0.9282, 0.8878, 0.724, 0.4596, 0.1313],
        [-0.1033, -0.3614, -0.5693, -0.6981, -0.7299, -0.6602, -0.4987, -0.268, 0.0, 0.268, 0.4987, 0.6602, 0.7299, 0.6981, 0.5693, 0.3614, 0.1033],
        [-0.0608, -0.213, -0.3355, -0.4114, -0.4301, -0.389, -0.2939, -0.1579, 0.0, 0.1579, 0.2939, 0.389, 0.4301, 0.4114, 0.3355, 0.213, 0.0608],
        [-0.01, -0.0349, -0.055, -0.0675, -0.0706, -0.0638, -0.0482, -0.0259, 0.0, 0.0259, 0.0482, 0.0638, 0.0706, 0.0675, 0.055, 0.0349, 0.01],
        [0.0423, 0.1479, 0.2331, 0.2858, 0.2988, 0.2703, 0.2042, 0.1097, -0.0, -0.1097, -0.2042, -0.2703, -0.2988, -0.2858, -0.2331, -0.1479, -0.0423],
        [0.0886, 0.3103, 0.4888, 0.5993, 0.6266, 0.5668, 0.4282, 0.2301, -0.0, -0.2301, -0.4282, -0.5668, -0.6266, -0.5993, -0.4888, -0.3103, -0.0886],
        [0.1227, 0.4295, 0.6765, 0.8296, 0.8673, 0.7845, 0.5927, 0.3185, -0.0, -0.3185, -0.5927, -0.7845, -0.8673, -0.8296, -0.6765, -0.4295, -0.1227],
        [0.1397, 0.489, 0.7703, 0.9445, 0.9875, 0.8932, 0.6748, 0.3626, -0.0, -0.3626, -0.6748, -0.8932, -0.9875, -0.9445, -0.7703, -0.489, -0.1397],
      ],
    },
  },
  {
    id: "macromolecule",
    note: "macromolecule \u00b7 a real structure, spun in 3D",
    visual: {
      kind: "macromolecule",
      learningGoal: "Haemoglobin is four subunits, each holding one haem group, which is what lets one molecule carry four oxygens.",
      caption: "Haemoglobin.",
      accession: "4HHB",
      title: "Haemoglobin",
    },
  },
  {
    id: "score",
    note: "score \u00b7 music notation, engraved from ABC",
    visual: {
      kind: "score",
      learningGoal: "The tune rises through the first phrase and answers it by falling back to the tonic.",
      caption: "Ode to Joy, opening phrase.",
      abc: "X:1\nT:Ode to Joy\nM:4/4\nL:1/4\nK:D\nFF G A | A G F E | D D E F | F3/2 E1/2 E2 |",
    },
  },
  {
    id: "circuit",
    note: "circuit \u00b7 the claimed equivalent resistance is recomputed",
    visual: {
      kind: "circuit",
      learningGoal: "Two equal resistors in parallel halve, so the pair behaves as one 50 ohm resistor in series with the rest.",
      caption: "A 25 ohm resistor in series with two 100 ohm resistors in parallel.",
      supply: { label: "9 V" },
      elements: {
        arrangement: "series",
        parts: [
          { component: "resistor", label: "R1", value: "25 \u03a9", ohms: 25 },
          {
            arrangement: "parallel",
            parts: [
              { component: "resistor", label: "R2", value: "100 \u03a9", ohms: 100 },
              { component: "resistor", label: "R3", value: "100 \u03a9", ohms: 100 },
            ],
          },
        ],
      },
      equivalentOhms: 75,
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
