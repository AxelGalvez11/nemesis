"use client";

// Drawing z = f(x, y) from a grid trusted code computed — §45 in three dimensions.
//
// 🔴 THE MOL* DISCIPLINE, POINT FOR POINT. The 3D library loads in an effect as its own chunk, so a
// lesson with no surface in it ships none of it; there is NO animation loop — the scene renders
// once and again on each orbit gesture, never per frame; and everything constructed is disposed on
// unmount, because a WebGL context is a resource the browser counts.
//
// 🔴 NOTHING MODEL-WRITTEN REACHES THIS COMPONENT BUT NUMBERS. The expression was evaluated on the
// server under the §45 allow list; what arrives is `grid`, already re-validated. The formula string
// is shown beside the drawing for the record and is never executed here.
//
// 🔴 COLOURS ARE READ FROM THE THEME AT DRAW TIME AND BAKED, so the theme is a dependency and a
// toggle redraws — the chemistry lane's rule, for the same reason: WebGL does not read CSS.

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import type { SurfaceVisual } from "@/lib/learn/canvas-visual";

const HEIGHT = 340;

/** The drawing spans [-1, 1] on each axis; z is squashed a little so peaks stay inside the frame. */
const Z_RELIEF = 0.85;

export function SurfacePlot({ visual }: { visual: SurfaceVisual }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const element = frame.current;
    if (!element) return;

    void (async () => {
      let three: typeof import("three");
      try {
        three = await import("three");
      } catch {
        if (!cancelled) setFailure(true);
        return;
      }
      let orbit: typeof import("three/examples/jsm/controls/OrbitControls.js") | null = null;
      try {
        orbit = await import("three/examples/jsm/controls/OrbitControls.js");
      } catch {
        orbit = null;
      }
      let sprite: typeof import("three-spritetext") | null = null;
      try {
        sprite = await import("three-spritetext");
      } catch {
        sprite = null;
      }
      if (cancelled || !frame.current) return;

      try {
        const width = element.clientWidth || 600;
        const renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, HEIGHT);
        element.replaceChildren(renderer.domElement);

        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(40, width / HEIGHT, 0.1, 100);
        camera.position.set(2.7, 1.9, 2.7);
        camera.lookAt(0, -0.1, 0);

        const styles = getComputedStyle(element);
        // 🔴 NORMALISED THROUGH A 2D CANVAS, BECAUSE THE BROWSER SPEAKS A NEWER CSS THAN three.js
        // PARSES. `getComputedStyle` here returns `color(srgb 1 1 1)`, which `three.Color` cannot
        // read — it silently keeps its default white, which happens to be right in dark mode and is
        // an invisible drawing in light mode. Assigning to a 2D context's `fillStyle` and reading
        // it back yields plain `#rrggbb` for any colour the page can express.
        const normalise = (value: string, fallback: string): string => {
          const probe = document.createElement("canvas").getContext("2d");
          if (!probe || !value) return fallback;
          probe.fillStyle = fallback;
          try {
            probe.fillStyle = value;
          } catch {
            return fallback;
          }
          return typeof probe.fillStyle === "string" ? probe.fillStyle : fallback;
        };
        /**
         * Is this a colour that actually covers what is behind it? `getComputedStyle` answers
         * `rgba(0, 0, 0, 0)` for an unpainted element, which is not black — it is nothing.
         */
        const opaque = (value: string): boolean => {
          const channels = /^rgba?\(([^)]+)\)/.exec(value);
          if (!channels) return Boolean(value) && value !== "transparent";
          const parts = channels[1]!.split(/[,/]/).map((part) => part.trim());
          return parts.length < 4 || Number(parts[3]) > 0.9;
        };

        /** The ground under the sheet: the nearest ancestor that actually paints one. */
        const paperOf = (from: HTMLElement): string => {
          for (let node: HTMLElement | null = from; node; node = node.parentElement) {
            const value = getComputedStyle(node).backgroundColor;
            if (opaque(value)) return value;
          }
          return theme === "dark" ? "#0b0d11" : "#ffffff";
        };

        // 🔴 THE RAMP RUNS FROM THE PAGE TOWARDS THE INK. IT USED TO READ `--ui-accent`, WHICH IS
        // NOT AN ACCENT. desktop-ui.css calls that token "the CHROME TINT" in its own comment and
        // resolves it to #404040 in light mode; the low end was then that same tint lerped 60%
        // further towards the text colour. Both ends therefore landed in near-black, the sheet
        // rendered as one flat dark shape, and the relief the drawing exists to show was gone.
        //
        // There is no colour to swap in, either: this product is deliberately monochrome, and
        // `--ui-action` — the real accent — is #0a0a0c. So relief has to be carried by VALUE.
        // The sheet spans paper-to-ink with troughs dark and peaks light, which is the direction
        // a lit surface actually runs and so the one the eye reads without being told.
        const ink = new three.Color(normalise(styles.color, "#444444"));
        const paper = new three.Color(normalise(paperOf(element), theme === "dark" ? "#0b0d11" : "#ffffff"));
        const valley = paper.clone().lerp(ink, 0.42);
        const peak = paper.clone().lerp(ink, 0.08);

        const rows = visual.grid.length;
        const cols = visual.grid[0]?.length ?? 0;
        const finite = visual.grid.flat().filter((cell): cell is number => cell !== null);
        const zMin = Math.min(...finite);
        const zMax = Math.max(...finite);
        const zSpan = zMax - zMin || 1;

        // One vertex per grid point — holes keep their slot so indexing never shifts — and one pair
        // of triangles per quad whose four corners all exist.
        const positions = new Float32Array(rows * cols * 3);
        const colours = new Float32Array(rows * cols * 3);
        const shade = new three.Color();
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const at = (row * cols + col) * 3;
            const cell = visual.grid[row]?.[col] ?? null;
            const t = cell === null ? 0 : (cell - zMin) / zSpan;
            positions[at] = -1 + (2 * col) / (cols - 1);
            positions[at + 1] = cell === null ? 0 : (-0.5 + t) * 2 * Z_RELIEF * 0.5;
            positions[at + 2] = 1 - (2 * row) / (rows - 1);
            shade.copy(valley).lerp(peak, t);
            colours[at] = shade.r;
            colours[at + 1] = shade.g;
            colours[at + 2] = shade.b;
          }
        }
        const indices: number[] = [];
        for (let row = 0; row < rows - 1; row += 1) {
          for (let col = 0; col < cols - 1; col += 1) {
            const a = visual.grid[row]?.[col];
            const b = visual.grid[row]?.[col + 1];
            const c = visual.grid[row + 1]?.[col];
            const d = visual.grid[row + 1]?.[col + 1];
            if (a === null || b === null || c === null || d === null) continue;
            if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
            const i = row * cols + col;
            indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
          }
        }
        const geometry = new three.BufferGeometry();
        geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new three.BufferAttribute(colours, 3));
        geometry.setIndex(indices);
        // No normals: nothing in this scene is lit, so computing and uploading them is pure cost.

        // 🔴 UNLIT, AND OFFSET IN DEPTH UNDER THE LATTICE. Lambert shading multiplied the height
        // ramp by the lights, which is a second signal fighting the first — flat vertex colour
        // keeps the ramp exactly as computed, and the ramp is the thing carrying the relief.
        //
        // The sheet still earns its place, because it does the one job a bare wireframe cannot: it
        // OCCLUDES the lattice behind it. Hidden lines are what separate a peak from a trough; a
        // wireframe you can see straight through is famously ambiguous in both directions. The
        // polygon offset pushes the sheet a hair further from the camera so the lines drawn on top
        // of it come out solid rather than stitching in and out of the surface they lie on.
        const material = new three.MeshBasicMaterial({
          side: three.DoubleSide,
          vertexColors: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const mesh = new three.Mesh(geometry, material);
        scene.add(mesh);

        // 🔴 THE LATTICE IS BUILT BY HAND RATHER THAN FROM `WireframeGeometry`. That helper draws
        // every edge of every triangle, so it also draws the diagonal each quad happened to be
        // split along — the viewer then sees a triangulated mesh, which is an artefact of how the
        // surface was tessellated and not something any course reasons about.
        //
        // What a calculus text draws is the traces: hold x and walk y, hold y and walk x. Those
        // are precisely the rows and columns of the grid, so they are emitted directly. Segments
        // touching a hole are dropped for the same reason the triangles around it were.
        const lattice: number[] = [];
        const solid = (row: number, col: number) => (visual.grid[row]?.[col] ?? null) !== null;
        const span = (rowA: number, colA: number, rowB: number, colB: number) => {
          if (!solid(rowA, colA) || !solid(rowB, colB)) return;
          const from = (rowA * cols + colA) * 3;
          const to = (rowB * cols + colB) * 3;
          lattice.push(
            positions[from]!,
            positions[from + 1]!,
            positions[from + 2]!,
            positions[to]!,
            positions[to + 1]!,
            positions[to + 2]!,
          );
        };
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols - 1; col += 1) span(row, col, row, col + 1);
        }
        for (let col = 0; col < cols; col += 1) {
          for (let row = 0; row < rows - 1; row += 1) span(row, col, row + 1, col);
        }
        const wire = new three.LineSegments(
          new three.BufferGeometry().setAttribute(
            "position",
            new three.BufferAttribute(new Float32Array(lattice), 3),
          ),
          // 🔴 NOT 0.18, WHICH IS WHERE THIS STARTED. Ink at that alpha over a sheet that was also
          // ink is not a faint lattice, it is no lattice: the plot read as a solid dark shape with
          // no depth in it. The lattice is the drawing, so it is weighted like one.
          new three.LineBasicMaterial({ color: ink, opacity: 0.55, transparent: true }),
        );
        scene.add(wire);

        const floor = -Z_RELIEF * 0.5 - 0.12;
        const outline = new three.LineLoop(
          new three.BufferGeometry().setFromPoints([
            new three.Vector3(-1, floor, -1),
            new three.Vector3(1, floor, -1),
            new three.Vector3(1, floor, 1),
            new three.Vector3(-1, floor, 1),
          ]),
          new three.LineBasicMaterial({ color: ink, opacity: 0.4, transparent: true }),
        );
        scene.add(outline);
        const zAxis = new three.Line(
          new three.BufferGeometry().setFromPoints([
            new three.Vector3(-1, floor, 1),
            new three.Vector3(-1, floor + 2 * Z_RELIEF * 0.5 + 0.24, 1),
          ]),
          new three.LineBasicMaterial({ color: ink, opacity: 0.4, transparent: true }),
        );
        scene.add(zAxis);

        const sprites: Array<InstanceType<NonNullable<typeof sprite>["default"]>> = [];
        if (sprite) {
          const inkText = `#${ink.getHexString()}`;
          const make = (text: string, x: number, y: number, z: number) => {
            const label = new sprite!.default(text, 0.13, inkText);
            label.position.set(x, y, z);
            // An axis label the sheet can occlude is an axis label that vanishes from half the
            // camera angles. Labels draw over everything, which is what paper diagrams do too.
            label.material.depthTest = false;
            label.renderOrder = 2;
            scene.add(label);
            sprites.push(label);
          };
          make(visual.xLabel ?? "x", 1.3, floor, 1.15);
          make(visual.yLabel ?? "y", 1.15, floor, -1.3);
          make(visual.zLabel ?? "z", -1, floor + 2 * Z_RELIEF * 0.5 + 0.38, 1);
        }

        // No lights: every material in this scene is unlit by choice (see the sheet above), so a
        // light here would cost a uniform upload per draw and change nothing on screen.

        const draw = () => renderer.render(scene, camera);
        let controls: { dispose: () => void } | null = null;
        if (orbit) {
          const spun = new orbit.OrbitControls(camera, renderer.domElement);
          spun.enablePan = false;
          spun.minDistance = 2;
          spun.maxDistance = 8;
          spun.addEventListener("change", draw);
          controls = spun;
        }
        draw();
        setFailure(false);

        cleanup = () => {
          controls?.dispose();
          for (const label of sprites) {
            label.material.map?.dispose();
            label.material.dispose();
          }
          wire.geometry.dispose();
          (wire.material as { dispose: () => void }).dispose();
          outline.geometry.dispose();
          (outline.material as { dispose: () => void }).dispose();
          zAxis.geometry.dispose();
          (zAxis.material as { dispose: () => void }).dispose();
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!cancelled) setFailure(true);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      cleanup = null;
    };
  }, [theme, visual]);

  if (failure) {
    return (
      <p className="font-mono text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
        z = {visual.expression}
      </p>
    );
  }
  return (
    <div>
      <div ref={frame} aria-label={visual.learningGoal} role="img" />
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        <span>z = {visual.expression}</span>
        <span className="font-sans">
          x {visual.xFrom} to {visual.xTo} · y {visual.yFrom} to {visual.yTo} · drag to turn it
        </span>
      </p>
    </div>
  );
}
