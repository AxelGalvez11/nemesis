"use client";

// DEV-ONLY PREVIEW — the 3D anatomy viewer, one region at a time, with no resolver in the loop.
//
// 🔴 WHY THIS EXISTS SEPARATELY FROM /dev-preview/visual-lab. That harness asks the ROUTER what a
// concept should be shown as, which needs the network and an account. This one asks the VIEWER to
// draw a region that has already been chosen, which needs neither: the meshes are static files
// under `public/anatomy/`, and `AnatomyViewer` loads them same-origin.
//
// The `resolved` blocks below are written by hand, but every value in them is copied verbatim from
// `ANATOMY_ATLAS` — the region slug, its title, its asset path, its source, and structure names
// that really exist in that region's node list. A name the atlas does not have would highlight
// nothing and the picture would quietly be of the wrong thing.
//
// ?only=<id> renders a single card, which is what the capture script uses.

import { useEffect, useState } from "react";

import { AnatomyViewer } from "@/components/workspace/learn/anatomy-viewer";
import type { AnatomyVisual } from "@/lib/learn/canvas-visual";

interface Card {
  readonly id: string;
  readonly visual: AnatomyVisual;
}

const CARDS: readonly Card[] = [
  {
    id: "heart",
    visual: {
      kind: "anatomy",
      structure: "left ventricle",
      learningGoal:
        "The left ventricle drives the whole systemic circuit, which is why its wall is the thickest chamber of the heart.",
      caption: "The left ventricle, in the cardiovascular system.",
      resolved: {
        region: "cardiovascular-system",
        regionTitle: "Cardiovascular system",
        assetPath: "/anatomy/cardiovascular-system.glb",
        source: "z-anatomy",
        structures: ["Left ventricle"],
      },
    },
  },
  {
    id: "nervous",
    visual: {
      kind: "anatomy",
      structure: "hippocampus",
      learningGoal:
        "The hippocampus sits deep in the temporal lobe on each side, and is where new episodic memories are first laid down.",
      caption: "The hippocampus, in the nervous system.",
      resolved: {
        region: "nervous-system",
        regionTitle: "Nervous system and sense organs",
        assetPath: "/anatomy/nervous-system.glb",
        source: "z-anatomy",
        // 🔴 NAMED, NOT THE WHOLE REGION. Empty structures frames everything, and this region is
        // brain plus the entire spinal cord — a tall thin object that arrives at a landscape card
        // as a thread. Naming a structure puts the camera on it and gives the ghost something to
        // be context FOR, which is the point of the isolate-and-frame move.
        // 🔴 A LEAF, NOT A GROUPING NODE. "White matter of telencephalon" looks like the better
        // pick — it is the biggest mesh in the region — and it is a PARENT: the viewer lights a
        // parent's whole subtree, so it picked up corpus callosum, fornix, stria terminalis and
        // the rest, produced eight overlapping labels, and grew the framed box until the spinal
        // cord pulled the camera back. The hippocampus is a leaf and frames the brain cleanly.
        structures: ["Hippocampus.l", "Hippocampus.r"],
      },
    },
  },
  {
    id: "skeleton",
    visual: {
      kind: "anatomy",
      structure: "femur",
      learningGoal: "The femur is the longest bone in the body and carries the whole load of standing.",
      caption: "The femur, in the skeleton.",
      resolved: {
        region: "overview-skeleton",
        regionTitle: "Skeleton",
        assetPath: "/anatomy/overview-skeleton.glb",
        source: "open3dmodel",
        structures: ["Femur.r"],
      },
    },
  },
];

export default function AnatomyCardsPreview() {
  const [only, setOnly] = useState<string | null>(null);

  useEffect(() => {
    setOnly(new URLSearchParams(window.location.search).get("only"));
  }, []);

  const shown = only ? CARDS.filter((c) => c.id === only) : CARDS;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      {only ? null : (
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-(--ui-text-primary)">Anatomy regions</h1>
          <p className="text-sm text-(--ui-text-tertiary)">
            The real viewer, loading real meshes from the atlas. No resolver, no network.
          </p>
        </header>
      )}

      {shown.map((card) => (
        <section className="flex flex-col gap-2" data-card={card.id} key={card.id}>
          <AnatomyViewer visual={card.visual} />
        </section>
      ))}
    </main>
  );
}
