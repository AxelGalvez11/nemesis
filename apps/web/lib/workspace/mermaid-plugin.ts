"use client";

// Streamdown's mermaid door, wired to the library we already load lazily.
//
// 🔴🔴 WHY THIS FILE EXISTS: THE PRODUCT HAD TWO MERMAID DOORS AND ONE OF THEM WAS STATIC.
// `mermaid-diagram.tsx` has said since it was written that "the library loads on first use, not in
// the bundle" — and `components/ai-elements/message.tsx` then imported `@streamdown/mermaid`, whose
// entire published module begins `import n from "mermaid"`. A static import anywhere in a chunk's
// graph pulls the library into that chunk, so the lazy door bought nothing.
//
// MEASURED, production, 2026-09-02: `/learn` downloaded 8.86 MB of JavaScript across 69 files, and
// its single largest chunk was 4.12 MB. Bundling `@streamdown/mermaid` on its own with esbuild:
// 3.37 MB minified, 927 KB gzipped. Its marginal cost beside Streamdown's other plugins: 3.12 MB
// minified, 854 KB gzipped — about a third of every byte of script on the route, for a library most
// answers never need.
//
// 🔴 THE PLUGIN CONTRACT ALREADY ALLOWED THIS. Streamdown calls `getMermaid(config)` and then
// `await instance.render(id, chart)` inside an async effect with its own try/catch, so `render` is
// free to load the library first. Nothing about the shape changes; only WHEN the megabytes arrive.
//
// 🔴 ONE CONFIGURATION, NOT TWO. `@streamdown/mermaid` initialised with `theme: "default"` and
// `fontFamily: "monospace"`; the chat fence initialises with the page-measured light/dark theme and
// the page's own font. Routing both through `loadEngine` means a diagram looks the same wherever it
// is drawn, and `securityLevel: "strict"` is guaranteed for both rather than agreed by two files.

import type { MermaidConfig } from "mermaid";
import type { DiagramPlugin } from "streamdown";

import { loadEngine } from "@/lib/workspace/mermaid-diagram";

/**
 * The mermaid plugin, loading nothing until a diagram is actually drawn.
 *
 * 🔴 `initialize` IS ACCEPTED AND APPLIED LATE, NOT IGNORED. Streamdown's own renderer never calls
 * it — it passes config to `getMermaid` and goes straight to `render` — but the plugin interface
 * offers it, and a caller that used it and silently got nothing would be worse than one that gets
 * its config applied a beat later. It is held until the library exists and applied then.
 *
 * 🔴 THE OVERRIDES CANNOT UNSET `securityLevel: "strict"` BY ACCIDENT, because they are applied on
 * top of a fully initialised engine and every call site in this repo passes no config at all. A
 * future caller that deliberately passes one is deliberately overriding it, which is the same
 * latitude `@streamdown/mermaid` gave.
 */
export const mermaidPlugin: DiagramPlugin = {
  getMermaid(config?: MermaidConfig) {
    return {
      initialize(next: MermaidConfig) {
        void loadEngine().then((mermaid) => mermaid.initialize(next));
      },
      async render(id: string, source: string) {
        const mermaid = await loadEngine();
        if (config) mermaid.initialize(config);
        return mermaid.render(id, source);
      },
    };
  },
  language: "mermaid",
  name: "mermaid",
  type: "diagram",
};
