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
        // 🔴 THE COLOUR IS MEASURED, NOT PARSED, AND THE PARSING VERSION SHIPPED BROKEN FOR MONTHS.
        // Every theme token in `desktop-ui.css` is a `color-mix(in srgb, …)`, which `getComputedStyle`
        // resolves to `color(srgb 0.96 0.96 0.97)`. `three.Color` cannot read that form: it warns and
        // keeps its DEFAULT, which is white. So ink, paper, valley and peak were all white — the plot
        // drew as a solid white blob with no lattice in it, which is exactly what the owner
        // photographed in dark mode and could not see at all in light mode.
        //
        // 🔴 THE PREVIOUS FIX WAS THE RIGHT IDEA AND THE WRONG READ-BACK. It assigned the value to a
        // 2D context's `fillStyle` and read the string back, believing that yields `#rrggbb`. It does
        // for `rgb(…)`; for `color(srgb …)` Chrome round-trips the modern form UNCHANGED, so the
        // string handed to three.js was the same one it could not parse. Measured here: `fillStyle`
        // in, `color(srgb 0.960784 0.964706 0.972549)` out.
        //
        // Painting one pixel and reading it back cannot have this failure mode. Whatever the browser
        // can display, it can display into a 1×1 canvas, and `getImageData` answers in plain bytes.
        const probe = (() => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          return canvas.getContext("2d", { willReadFrequently: true });
        })();
        /** Any colour the page can express, as channels in 0–1, or null if the browser refused it. */
        const readColour = (value: string): { r: number; g: number; b: number; a: number } | null => {
          if (!probe || !value) return null;
          // 🔴 TWO SENTINELS, BECAUSE `fillStyle` FAILS SILENTLY. Assigning a value the browser
          // cannot parse leaves the property at whatever it already held — so a value that "sticks"
          // to black and to white is a value that was never applied at all.
          probe.fillStyle = "#000000";
          try {
            probe.fillStyle = value;
          } catch {
            return null;
          }
          const overBlack = probe.fillStyle;
          probe.fillStyle = "#ffffff";
          try {
            probe.fillStyle = value;
          } catch {
            return null;
          }
          if (probe.fillStyle !== overBlack) return null;
          probe.clearRect(0, 0, 1, 1);
          probe.fillRect(0, 0, 1, 1);
          const pixel = probe.getImageData(0, 0, 1, 1).data;
          return { a: (pixel[3] ?? 0) / 255, b: (pixel[2] ?? 0) / 255, g: (pixel[1] ?? 0) / 255, r: (pixel[0] ?? 0) / 255 };
        };
        const toColour = (value: string, fallback: string): InstanceType<typeof three.Color> => {
          const measured = readColour(value) ?? readColour(fallback);
          return measured
            ? new three.Color().setRGB(measured.r, measured.g, measured.b, three.SRGBColorSpace)
            : new three.Color(fallback);
        };

        /**
         * The ground under the sheet: the nearest ancestor that actually paints one.
         *
         * 🔴 ALPHA COMES FROM THE SAME PIXEL. The old test matched `rgba(…)` with a regex and treated
         * anything else as opaque, so a fully transparent `color(srgb 0 0 0 / 0)` ancestor counted as
         * black paper and the ramp was built against a ground nobody can see.
         */
        const paperOf = (from: HTMLElement): string => {
          for (let node: HTMLElement | null = from; node; node = node.parentElement) {
            const value = getComputedStyle(node).backgroundColor;
            if ((readColour(value)?.a ?? 0) > 0.9) return value;
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
        const ink = toColour(styles.color, "#444444");
        const paper = toColour(paperOf(element), theme === "dark" ? "#0b0d11" : "#ffffff");

        // 🔴 VALLEYS DARK AND PEAKS LIGHT MEANS THE MIX FLIPS WITH THE PAGE, AND IT DID NOT. Both
        // ends were stated as a distance from paper towards ink, which reads "darker" only when the
        // paper is the lighter of the two. On a dark page ink IS the light colour, so the same two
        // numbers put the peaks at near-black and the troughs at mid-grey: a surface lit from
        // underneath. Which end takes more ink is therefore decided by the paper's own luminance.
        const bright = 0.2126 * paper.r + 0.7152 * paper.g + 0.0722 * paper.b >= 0.5;
        const [lowMix, highMix] = bright ? [0.44, 0.1] : [0.12, 0.46];
        const valley = paper.clone().lerp(ink, lowMix);
        const peak = paper.clone().lerp(ink, highMix);

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

        // 🔴 THE BOX IS THE DEPTH CUE, AND A SINGLE FLOOR RECTANGLE WAS NOT ONE. What used to be here
        // was one outline on the ground and one upright stick for z. Against that, a sheet floating
        // in space has nothing to be measured by: how high a peak is, and how far back it sits, are
        // both unanswerable, so the drawing reads flat however good the shading is.
        //
        // What every plotting tool draws instead is three ruled panes — a floor and two back walls —
        // and the reason is that a grid line has a KNOWN spacing. Seeing the far squares smaller than
        // the near ones is what tells the eye how deep the box is, and seeing where a peak lands
        // against the wall rulings is what tells it how high the peak is.
        //
        // 🔴 THE BACK WALLS ARE THE ONES FURTHEST FROM THE CAMERA, RECOMPUTED ON EVERY TURN OF THE
        // SCENE. Drawing all four is a cage that the surface hides inside; drawing two fixed ones
        // puts a wall in front of the drawing as soon as the learner orbits past a corner. So all
        // four are built once and two are shown, chosen by which side of the box the camera is on.
        const floor = -Z_RELIEF * 0.5 - 0.12;
        const ceiling = Z_RELIEF * 0.5 + 0.12;
        const DIVISIONS = 4;
        const at = (index: number) => -1 + (2 * index) / DIVISIONS;
        const level = (index: number) => floor + ((ceiling - floor) * index) / DIVISIONS;

        const ruling = new three.LineBasicMaterial({ color: ink, opacity: 0.15, transparent: true });
        const edging = new three.LineBasicMaterial({ color: ink, opacity: 0.32, transparent: true });
        const panes: InstanceType<typeof three.LineSegments>[] = [];
        const pane = (points: number[], material: InstanceType<typeof three.LineBasicMaterial>) => {
          const built = new three.LineSegments(
            new three.BufferGeometry().setAttribute(
              "position",
              new three.BufferAttribute(new Float32Array(points), 3),
            ),
            material,
          );
          // Behind the sheet in every sense: the surface is the subject and the box is the paper it
          // is drawn on, so a ruling that reaches the camera first would read as part of the shape.
          built.renderOrder = -1;
          scene.add(built);
          panes.push(built);
          return built;
        };

        const groundGrid: number[] = [];
        for (let i = 0; i <= DIVISIONS; i += 1) {
          groundGrid.push(at(i), floor, -1, at(i), floor, 1);
          groundGrid.push(-1, floor, at(i), 1, floor, at(i));
        }
        pane(groundGrid, ruling);
        pane([-1, floor, -1, 1, floor, -1, 1, floor, -1, 1, floor, 1, 1, floor, 1, -1, floor, 1, -1, floor, 1, -1, floor, -1], edging);

        /** One upright wall, ruled the same way the floor is, at `x = side` or `z = side`. */
        const wall = (axis: "x" | "z", side: -1 | 1) => {
          const rulings: number[] = [];
          for (let i = 0; i <= DIVISIONS; i += 1) {
            if (axis === "x") {
              rulings.push(side, floor, at(i), side, ceiling, at(i));
              rulings.push(side, level(i), -1, side, level(i), 1);
            } else {
              rulings.push(at(i), floor, side, at(i), ceiling, side);
              rulings.push(-1, level(i), side, 1, level(i), side);
            }
          }
          const ruled = pane(rulings, ruling);
          const outline =
            axis === "x"
              ? [side, floor, -1, side, ceiling, -1, side, ceiling, -1, side, ceiling, 1, side, ceiling, 1, side, floor, 1]
              : [-1, floor, side, -1, ceiling, side, -1, ceiling, side, 1, ceiling, side, 1, ceiling, side, 1, floor, side];
          const framed = pane(outline, edging);
          // 🔴 NOT WRAPPED IN A `Group`. `add` REPARENTS: putting both lines in a group that is never
          // itself added to the scene takes them straight back out of it, and the walls vanish.
          return { framed, ruled };
        };
        const wallXLow = wall("x", -1);
        const wallXHigh = wall("x", 1);
        const wallZLow = wall("z", -1);
        const wallZHigh = wall("z", 1);

        const sprites: Array<InstanceType<NonNullable<typeof sprite>["default"]>> = [];
        const inkText = `#${ink.getHexString()}`;
        const label = (text: string) => {
          if (!sprite) return null;
          const made = new sprite.default(text, 0.13, inkText);
          // An axis label the sheet can occlude is an axis label that vanishes from half the
          // camera angles. Labels draw over everything, which is what paper diagrams do too.
          made.material.depthTest = false;
          made.renderOrder = 2;
          scene.add(made);
          sprites.push(made);
          return made;
        };
        const xLabel = label(visual.xLabel ?? "x");
        const yLabel = label(visual.yLabel ?? "y");
        const zLabel = label(visual.zLabel ?? "z");

        /**
         * Show the two walls the camera is looking AT, and hang each axis name off an edge the
         * learner can still see. Both answers change the moment the scene is turned, so both are
         * settled here rather than once at build time.
         */
        const faceTheCamera = () => {
          const behindX = camera.position.x > 0;
          const behindZ = camera.position.z > 0;
          for (const [group, shown] of [
            [wallXLow, behindX],
            [wallXHigh, !behindX],
            [wallZLow, behindZ],
            [wallZHigh, !behindZ],
          ] as const) {
            group.ruled.visible = shown;
            group.framed.visible = shown;
          }
          const nearX = behindX ? 1 : -1;
          const nearZ = behindZ ? 1 : -1;
          xLabel?.position.set(0, floor - 0.12, nearZ * 1.3);
          yLabel?.position.set(nearX * 1.3, floor - 0.12, 0);
          zLabel?.position.set(-nearX, ceiling + 0.2, -nearZ);
        };
        faceTheCamera();

        // No lights: every material in this scene is unlit by choice (see the sheet above), so a
        // light here would cost a uniform upload per draw and change nothing on screen.

        // Which walls are the back walls is settled before each frame, never on a timer — the scene
        // only moves when a hand moves it, so this runs exactly as often as the render does.
        const draw = () => {
          faceTheCamera();
          renderer.render(scene, camera);
        };
        let controls: { dispose: () => void } | null = null;
        if (orbit) {
          const spun = new orbit.OrbitControls(camera, renderer.domElement);
          spun.enablePan = false;
          spun.minDistance = 2;
          spun.maxDistance = 8;
          // 🔴 THE CAMERA STAYS ABOVE THE FLOOR. Orbiting underneath puts the ground pane between the
          // learner and the surface, so the drawing disappears behind its own grid and the only way
          // back is to guess which way to drag.
          spun.maxPolarAngle = Math.PI / 2 - 0.04;
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
          for (const built of panes) built.geometry.dispose();
          ruling.dispose();
          edging.dispose();
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
