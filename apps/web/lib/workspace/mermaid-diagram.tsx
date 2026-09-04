"use client";

// A fenced ```mermaid block, drawn — flow charts, mind maps, sequence and state diagrams in chat.
//
// 🔴🔴 OWNER ORDER, 2026-08-30: *"I'm talking about mermaid JS so that I can do flow charts,
// diagrams, graphs, mind maps in chat. Like, that's literally all I want."* The renderer's own
// header had deferred this ("the streaming/Shiki/mermaid machinery is out of scope for the
// non-streaming v1"); this is that machinery arriving. The semantic-visuals boundary is untouched:
// `canvas-visual.ts` still refuses Mermaid INSIDE the visuals array, where payloads are typed and
// validated. A fence in prose is the other lane, and it is rendered, not trusted — see below.
//
// 🔴 PARSE IS THE GATE, AND THE FALLBACK IS EXACTLY TODAY'S CODE BLOCK. `mermaid.parse` runs
// before any render; a fence that does not parse draws the same bordered mono block every fence
// drew before this file existed. That one rule covers three cases at once: a model that wrote
// broken syntax (the learner sees the text, never an error box), a HALF-STREAMED fence (it stands
// as code while tokens arrive and becomes the diagram the moment it completes), and a fence in
// some dialect our mermaid version does not speak.
//
// 🔴 `securityLevel: "strict"` AND NOTHING INTERACTIVE. Strict mode makes mermaid sanitise label
// text and refuse script/click directives — the fence's contents are model output riding learner
// context, so they are rendered as a PICTURE with exactly zero ability to run anything. The SVG
// still lands via innerHTML because that is how mermaid hands it over; strict mode is what makes
// that acceptable.
//
// 🔴 THE LIBRARY LOADS ON FIRST USE, NOT IN THE BUNDLE. Mermaid is over a megabyte; most answers
// carry no diagram. The dynamic import keys off the first fence actually rendered, and the module
// promise is shared so ten diagrams in one conversation initialise once.
//
// 🔴 THE THEME IS CHOSEN BY MEASURING THE PAGE, NOT BY PARSING A TOKEN — the lesson
// `theme-tokens-break-webgl` recorded: a CSS variable can compute to `color-mix(...)` forms a
// library reads as garbage, so the page background is read as computed rgb and its luminance
// decides dark or light. Failure of any step falls back to the light theme.

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type MermaidModule = typeof import("mermaid").default;

let engine: Promise<MermaidModule> | null = null;

function darkPage(): boolean {
  try {
    const raw = getComputedStyle(document.body).backgroundColor;
    const parts = raw.match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return false;
    const [r, g, b] = parts.map(Number);
    return 0.299 * r! + 0.587 * g! + 0.114 * b! < 128;
  } catch {
    return false;
  }
}

/**
 * The one mermaid engine in the product, loaded on first use.
 *
 * 🔴🔴 EXPORTED, AND THAT IS THE WHOLE OF PR "mermaid is not in the bundle". The header above says
 * "THE LIBRARY LOADS ON FIRST USE, NOT IN THE BUNDLE" — and it was not true, because a SECOND door
 * existed. `components/ai-elements/message.tsx` imported `@streamdown/mermaid`, whose first line is
 * a plain `import n from "mermaid"`, so every page that could render a message pulled the whole
 * library in eagerly. Measured on production 2026-09-02: the `/learn` route shipped 8.86 MB of
 * JavaScript in 69 files, and its largest chunk was 4.12 MB — mermaid. Bundling the same import
 * graph with esbuild puts the marginal cost of that one line at 3.12 MB minified, 854 KB gzipped.
 *
 * So the plugin in `mermaid-plugin.ts` reaches the library through THIS function instead, and there
 * is exactly one place that decides mermaid's configuration.
 *
 * 🔴 `suppressErrorRendering` IS NEW HERE AND IT IS THE STREAMDOWN DEFAULT ARRIVING, NOT A CHANGE
 * OF MIND. Without it a `render` that throws makes mermaid append its own "Syntax error" graphic to
 * the document. This component never hits that (it parses first), but the plugin has no such gate —
 * it hands failures to Streamdown's own error component — and one engine must be safe for both.
 */
export function loadEngine(): Promise<MermaidModule> {
  engine ??= import("mermaid").then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      fontFamily: "inherit",
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: darkPage() ? "dark" : "neutral",
    });
    return mermaid;
  });
  return engine;
}

/** The exact classes the plain fenced block wears in chat-markdown.tsx, so the fallback (and the
 *  half-streamed state) is indistinguishable from the block every fence drew before this existed. */
const FALLBACK_PRE =
  "aui-md-code-block my-2 overflow-x-auto rounded-[0.375rem] border border-border bg-muted/35 p-2.5 text-foreground";

export function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const reactId = useId();
  // Mermaid wants a DOM-safe element id; useId's colons are not one.
  const domId = useRef(`mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`);

  useEffect(() => {
    let alive = true;
    const text = chart.trim();
    if (!text) {
      setSvg(null);
      return;
    }
    void loadEngine()
      .then(async (mermaid) => {
        // 🔴 parse first, render second. `suppressErrors` turns "invalid" into a clean false
        // instead of a throw, and an invalid fence simply stays a code block.
        const valid = await mermaid.parse(text, { suppressErrors: true });
        if (!alive || !valid) {
          if (alive) setSvg(null);
          return;
        }
        const rendered = await mermaid.render(domId.current, text);
        if (alive) setSvg(rendered.svg);
      })
      .catch(() => {
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [chart]);

  if (!svg) {
    return (
      <pre className={FALLBACK_PRE}>
        <code className="block overflow-x-auto whitespace-pre font-mono text-[0.8em]">{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className={cn(
        // 🔴🔴 A DIAGRAM IS A FIGURE INSIDE PROSE, NOT A PAGE. Owner, 2026-09-01: *"the mermaid
        // diagrams are too big, they take away from the flow of reading."* With only `max-w-full`
        // and `h-auto`, a wide flowchart grows to the full reading column and its height follows
        // the aspect ratio — at this canvas's 822px column a 4:3 chart is over 600px tall, so the
        // sentence that introduces it and the sentence after it cannot be on screen together. That
        // is what "takes away from the flow" means: the reader loses the thread to look at the
        // picture explaining the thread.
        //
        // 🔴🔴 THE CAP IS ON THE BOX, NOT ON THE PICTURE, AND THAT MOVE IS A FIX MEASURED ON
        // PRODUCTION (2026-09-04, the first diagram a Canvas card ever drew). It used to sit on the
        // SVG as `max-h-[340px] w-auto`, which scales a diagram DOWN until its height fits. That is
        // right for a wide chart and ruinous for a tall one: a `flowchart TD` of fourteen steps has
        // an aspect around 1:2.7, so fitting 2,289 units of height into 340 pixels left the picture
        // 127px wide in a 617px card. Every label was there and none of them could be read.
        //
        // So the figure still takes at most 340px of the reading flow, which is the whole of the
        // owner's rule, and the diagram is drawn at the column's width where its text is legible.
        // What does not fit scrolls inside the box rather than shrinking the drawing.
        "my-[16px] max-h-[340px] overflow-auto",
        // 🔴 `nowheel` IS FOR THE BOARD. React Flow pans the canvas on wheel unless the element
        // opts out, so without it a scroll inside a tall diagram would slide the whole board.
        "nowheel",
        "[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full",
      )}
      // Sanitised by mermaid under securityLevel "strict" — see the header.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
