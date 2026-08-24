"use client";

// Drawing a macromolecule from its accession — §42's viewer lane, beside the chemistry one.
//
// 🔴 THE `ChemicalStructure` PATTERN, ONE DATABASE UP. The spec carries an identifier and never
// geometry; a trusted engine computes every pixel from the Protein Data Bank's own deposited
// coordinates; the identifier stays printed beside the drawing so what was asked for is never a
// secret; and a failure renders nothing rather than a broken frame, because the teaching text
// stands on its own.
//
// 🔴 THE ENGINE IS LOADED IN AN EFFECT, NOT IMPORTED AT MODULE SCOPE, and here it is load-bearing
// rather than a courtesy: Mol* is an order of magnitude heavier than the SMILES drawer (~4MB of
// WebGL engine), reaches for `document` while initialising, and a lesson with no macromolecule in
// it must not pay a byte of it. The dynamic import puts it in its own chunk, fetched the first
// time a 3D structure actually appears.
//
// 🔴 THE STRUCTURE DATA COMES FROM THE DATABASE, FROM THE BROWSER, AND THAT IS A STATED CHOICE.
// The NAME→accession resolution runs on our server (`app/api/learn/macromolecule`), so the search
// never sees a learner. The coordinate file itself is fetched like the reference lane fetches its
// images — straight from the repository's public file store (`models.rcsb.org`), because proxying
// multi-megabyte structures through our own routes would double every load to save a hostname.
//
// 🔴 ONE VIEWER AT A TIME, AND IT DIES WITH ITS FRAME. A WebGL context is the scarcest resource a
// browser page holds (about a dozen per tab, silently evicted oldest-first). `dispose()` runs on
// unmount, and the effect guards against the unmount-mid-load race by checking a flag after every
// await — a plugin initialised into a dead frame would leak its context until eviction.

import { useEffect, useRef, useState } from "react";

import type { MacromoleculeVisual } from "@/lib/learn/canvas-visual";

/** The PDB's binary structure file for an entry. The accession is validated spec-side. */
export function macromoleculeDataUrl(accession: string): string {
  return `https://models.rcsb.org/${encodeURIComponent(accession.toUpperCase())}.bcif`;
}

/** Why nothing was drawn. Named so a blank space is diagnosable, exactly as elsewhere. */
type ViewerFailure =
  /** The engine could not be loaded — offline, blocked, or not installed. */
  | "viewer-unavailable"
  /** The database did not hand over this entry's coordinates. */
  | "structure-unavailable";

export function Macromolecule({ visual }: { visual: MacromoleculeVisual }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [failure, setFailure] = useState<ViewerFailure | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let plugin: { dispose: () => void } | null = null;

    (async () => {
      let molstar: {
        PluginContext: new (spec: unknown) => {
          init: () => Promise<void>;
          initViewerAsync: (canvas: HTMLCanvasElement, container: HTMLDivElement) => Promise<boolean>;
          builders: {
            data: { download: (params: { url: string; isBinary: boolean }, options?: unknown) => Promise<unknown> };
            structure: {
              parseTrajectory: (data: unknown, format: string) => Promise<unknown>;
              hierarchy: { applyPreset: (trajectory: unknown, preset: string) => Promise<unknown> };
            };
          };
          canvas3d?: { setProps: (props: unknown) => void };
          dispose: () => void;
        };
        DefaultPluginSpec: () => unknown;
      };
      try {
        const [context, spec] = await Promise.all([
          import("molstar/lib/mol-plugin/context"),
          import("molstar/lib/mol-plugin/spec"),
        ]);
        molstar = { DefaultPluginSpec: spec.DefaultPluginSpec, PluginContext: context.PluginContext as never };
      } catch {
        if (!cancelled) setFailure("viewer-unavailable");
        return;
      }
      if (cancelled || !frame.current || !canvas.current) return;

      try {
        const instance = new molstar.PluginContext(molstar.DefaultPluginSpec());
        plugin = instance;
        await instance.init();
        if (cancelled) return;
        const mounted = await instance.initViewerAsync(canvas.current, frame.current);
        if (cancelled) return;
        if (!mounted) {
          setFailure("viewer-unavailable");
          return;
        }
        // 🔴 TRANSPARENT, SO THE THEME IS THE BACKGROUND. The engine writes its clear colour into
        // the GL context rather than reading CSS, so a painted background would need the redraw
        // dance `ChemicalStructure` does. Transparency sidesteps it: dark mode and light mode both
        // show their own ground behind the molecule.
        //
        // 🔴 AND NOTHING ELSE. An idle-spin animation was tried here and REMOVED: passing a partial
        // `trackball` through `setProps` broke the engine's own parameter merge, and the draw loop
        // died throwing on every frame — a blank frame in place of a molecule. The structure is
        // still obviously 3D the moment it is touched, and a drag costs the learner nothing.
        instance.canvas3d?.setProps({ transparentBackground: true });
        const data = await instance.builders.data.download(
          { isBinary: true, url: macromoleculeDataUrl(visual.accession) },
          { state: { isGhost: true } },
        );
        if (cancelled) return;
        const trajectory = await instance.builders.structure.parseTrajectory(data, "mmcif");
        if (cancelled) return;
        await instance.builders.structure.hierarchy.applyPreset(trajectory, "default");
        if (cancelled) return;
        setReady(true);
      } catch {
        if (!cancelled) setFailure("structure-unavailable");
      }
    })();

    return () => {
      cancelled = true;
      plugin?.dispose();
    };
  }, [visual.accession]);

  // A failed load renders nothing — no empty frame, no apology. The prose stands on its own, the
  // same policy every other refused visual follows.
  if (failure) return null;

  return (
    <div aria-label={visual.learningGoal}>
      <div
        className="relative h-90 w-full overflow-hidden rounded-md"
        ref={frame}
        // The engine positions its canvas absolutely inside this frame; the height is the frame's
        // own claim, reserved before load so the page does not jump when the structure arrives.
      >
        <canvas className="h-full w-full" ref={canvas} />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
            Loading {visual.accession}…
          </p>
        )}
      </div>
      {/* 🔴 THE ACCESSION IS SHOWN, NOT HIDDEN BEHIND THE PICTURE — the same inspectability §42
          requires of a SMILES string. The entry's own title says what the search actually found,
          which is the honest answer to a fuzzy name; the source line is the provenance. */}
      <p className="mt-2 font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        {visual.accession}
        {visual.title ? ` · ${visual.title}` : ""}
      </p>
      <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        <a
          className="underline decoration-(--ui-stroke-primary) underline-offset-2 hover:text-(--ui-text-secondary)"
          href={`https://www.rcsb.org/structure/${encodeURIComponent(visual.accession)}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          RCSB Protein Data Bank
        </a>
        {visual.resolvedFrom ? ` · resolved from “${visual.resolvedFrom.name}”` : ""}
      </p>
    </div>
  );
}
