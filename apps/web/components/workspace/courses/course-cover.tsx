"use client";

// A course's cover: seven motifs, drawn from the slug, always grey.
//
// 🔴 EVERY VALUE IS DERIVED FROM `seed`, SO A COVER IS A PURE FUNCTION OF THE COURSE. Same course,
// same picture, on every device and after every re-import. Nothing here reads the clock or Math.random.
//
// 🔴 `currentColor` AT LOW OPACITY, NOT A LITERAL GREY. The card sets the colour; the cover paints
// with whatever it inherits, so dark mode and the accent picker both work without this file
// knowing they exist.

import { type CoverMotif } from "@/lib/courses/shelf";

/** A deterministic pseudo-random sequence from one seed. */
function rng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.abs(state % 1000) / 1000;
  };
}

const W = 362;
const H = 92;

export function CourseCover({ motif, seed, height = H }: { motif: CoverMotif; seed: number; height?: number }) {
  const next = rng(seed);
  const shapes: React.ReactNode[] = [];

  if (motif === "arcs") {
    for (let i = 0; i < 3; i += 1) {
      const lift = 18 + next() * 30;
      const y = 74 + i * 9;
      shapes.push(
        <path
          d={`M-10 ${y} C ${60 + i * 12} ${y}, ${76 + i * 8} ${lift}, ${150 + i * 18} ${lift} C ${230 + i * 10} ${lift}, ${250} ${y}, ${W + 10} ${y - 6}`}
          fill="none"
          key={`arc-${i}`}
          opacity={0.45 - i * 0.1}
          stroke="currentColor"
          strokeWidth={1.5}
        />,
      );
    }
    shapes.push(<circle cx={150} cy={22} fill="currentColor" key="dot" opacity={0.6} r={6} />);
  }

  if (motif === "cells") {
    for (let i = 0; i < 7; i += 1) {
      const cx = 40 + next() * (W - 80);
      const cy = 20 + next() * (H - 40);
      const r = 8 + next() * 20;
      shapes.push(<circle cx={cx} cy={cy} fill="none" key={`c-${i}`} opacity={0.4} r={r} stroke="currentColor" strokeWidth={1.4} />);
      if (i % 2 === 0) shapes.push(<circle cx={cx} cy={cy} fill="currentColor" key={`n-${i}`} opacity={0.45} r={Math.max(3, r / 4)} />);
    }
  }

  if (motif === "lattice") {
    const hex = (cx: number, cy: number, s: number) =>
      `M${cx} ${cy - s} L${cx + s * 0.87} ${cy - s / 2} L${cx + s * 0.87} ${cy + s / 2} L${cx} ${cy + s} L${cx - s * 0.87} ${cy + s / 2} L${cx - s * 0.87} ${cy - s / 2} Z`;
    for (let i = 0; i < 5; i += 1) {
      const cx = 90 + i * 44;
      const cy = i % 2 === 0 ? 46 : 46 + 24;
      shapes.push(<path d={hex(cx, cy, 22)} fill="none" key={`h-${i}`} opacity={0.4} stroke="currentColor" strokeWidth={1.5} />);
    }
    shapes.push(<circle cx={134} cy={46} fill="currentColor" key="v1" opacity={0.55} r={4} />);
    shapes.push(<circle cx={222} cy={46} fill="currentColor" key="v2" opacity={0.4} r={4} />);
  }

  if (motif === "waves") {
    for (let i = 0; i < 2; i += 1) {
      const amp = 22 + next() * 14;
      const y = 40 + i * 18;
      let d = `M-10 ${y}`;
      for (let x = 0; x <= W + 20; x += 44) d += ` C ${x + 14} ${y - amp}, ${x + 30} ${y + amp}, ${x + 44} ${y}`;
      shapes.push(<path d={d} fill="none" key={`w-${i}`} opacity={0.5 - i * 0.22} stroke="currentColor" strokeWidth={1.5} />);
    }
    shapes.push(<circle cx={W / 2} cy={40} fill="currentColor" key="node" opacity={0.6} r={5} />);
  }

  if (motif === "bars") {
    for (let i = 0; i < 9; i += 1) {
      const w = 20 + next() * 90;
      shapes.push(
        <rect fill="currentColor" height={6} key={`b-${i}`} opacity={0.22 + next() * 0.4} rx={3} width={w} x={40 + (i % 3) * 100} y={20 + Math.floor(i / 3) * 18} />,
      );
    }
  }

  if (motif === "orbits") {
    for (let i = 1; i <= 4; i += 1) {
      shapes.push(<circle cx={W / 2} cy={H / 2} fill="none" key={`o-${i}`} opacity={0.42 - i * 0.07} r={i * 15} stroke="currentColor" strokeWidth={1.3} />);
    }
    shapes.push(<circle cx={W / 2} cy={H / 2} fill="currentColor" key="core" opacity={0.65} r={7} />);
    for (let i = 0; i < 3; i += 1) {
      const a = next() * Math.PI * 2;
      const r = 30 + next() * 30;
      shapes.push(<circle cx={W / 2 + Math.cos(a) * r} cy={H / 2 + Math.sin(a) * r * 0.6} fill="currentColor" key={`m-${i}`} opacity={0.4} r={3.5} />);
    }
  }

  if (motif === "grid") {
    for (let i = 0; i < 6; i += 1) {
      shapes.push(<line key={`v-${i}`} opacity={0.22} stroke="currentColor" strokeWidth={1.2} x1={70 + i * 44} x2={70 + i * 44} y1={12} y2={80} />);
    }
    for (let i = 0; i < 4; i += 1) {
      shapes.push(<line key={`hz-${i}`} opacity={0.22} stroke="currentColor" strokeWidth={1.2} x1={60} x2={302} y1={20 + i * 18} y2={20 + i * 18} />);
    }
    for (let i = 0; i < 4; i += 1) {
      shapes.push(<circle cx={70 + Math.floor(next() * 6) * 44} cy={20 + Math.floor(next() * 4) * 18} fill="currentColor" key={`p-${i}`} opacity={0.5} r={5} />);
    }
  }

  return (
    <svg
      aria-hidden="true"
      className="block w-full text-(--ui-text-primary)"
      style={{ height: `${height}px`, background: "var(--ui-bg-quaternary)" }}
      viewBox={`0 0 ${W} ${H}`}
    >
      {shapes}
    </svg>
  );
}
