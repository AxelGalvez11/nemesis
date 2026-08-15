"use client";

// DEV-ONLY PREVIEW — the particle lab.
//
// Eight animated dotted-3D techniques side by side, so a visual direction can be
// chosen by looking rather than by reading a description. Nothing here is
// imported by the product: no landing page, no Canvas loader, no shell. Deleting
// this folder and `components/dev/particle-lab` removes the whole thing.
//
// It follows the same convention as the other dev-preview routes — a plain
// client page, no auth gate, not linked from any navigation.

import { ParticleLab } from "@/components/dev/particle-lab/lab";

import "@/components/dev/particle-lab/particle-lab.css";

export default function ParticleLabPage() {
  return <ParticleLab />;
}
