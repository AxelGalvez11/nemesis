"use client";

// Turning a named structure inside its region of the atlas — §42's ladder reaching the body.
//
// 🔴 THE MOL* DISCIPLINE, POINT FOR POINT, because this is the same kind of object: a heavy 3D
// viewer a lesson rarely needs. three.js and the mesh load in an effect as their own chunks and
// requests; there is NO animation loop — one render at load and one per orbit gesture; and
// everything constructed is disposed on unmount.
//
// 🔴 WHAT LOADS IS DECIDED BY THE STAMP, NEVER BY THE MODEL. `resolved.assetPath` was written by
// `anatomy-resolve.ts` from the harvest registry and re-validated as a same-origin `/anatomy/…`
// path — a model cannot steer this component at a URL. The Draco decoder is served the same way,
// from `/draco/`, copied out of our own three.js dependency at build time.
//
// 🔴 THE TEACHING MOVE IS ISOLATE-AND-FRAME. When the stamp names structures, they render solid,
// everything else fades to a ghost, and the camera frames the named bones rather than the body —
// which is what a teacher's pointer does on a chart, done with the camera.

import { useEffect, useRef, useState } from "react";

import type { AnatomyVisual } from "@/lib/learn/canvas-visual";
// 🔴 THE LICENCE, NEVER THE REGISTRY. Four strings for the credit line; the atlas's structure
// names stay server-side, where the route matches them. See `anatomy-licence.ts`.
import { anatomyCredit } from "@/lib/learn/anatomy-licence";

const HEIGHT = 380;

/** The atlas's own ivory, near enough; a bone chart is one of the few theme-independent objects. */
const BONE = 0xe0d9c8;
const FADED_OPACITY = 0.14;

export function AnatomyViewer({ visual }: { visual: AnatomyVisual }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState(false);

  const resolved = visual.resolved;
  const credit = anatomyCredit(resolved?.source);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const element = frame.current;
    if (!element || !resolved) return;

    void (async () => {
      let three: typeof import("three");
      let loaders: {
        GLTFLoader: typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
        DRACOLoader: typeof import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader;
      };
      let orbit: typeof import("three/examples/jsm/controls/OrbitControls.js") | null = null;
      try {
        three = await import("three");
        const [gltf, dracoModule] = await Promise.all([
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/loaders/DRACOLoader.js"),
        ]);
        loaders = { DRACOLoader: dracoModule.DRACOLoader, GLTFLoader: gltf.GLTFLoader };
      } catch {
        if (!cancelled) setFailure(true);
        return;
      }
      try {
        orbit = await import("three/examples/jsm/controls/OrbitControls.js");
      } catch {
        orbit = null;
      }
      if (cancelled || !frame.current) return;

      try {
        const width = element.clientWidth || 600;
        const renderer = new three.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, HEIGHT);
        element.replaceChildren(renderer.domElement);

        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(35, width / HEIGHT, 0.01, 50);

        const dracoLoader = new loaders.DRACOLoader();
        dracoLoader.setDecoderPath("/draco/");
        const loader = new loaders.GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const gltf = await loader.loadAsync(resolved.assetPath);
        if (cancelled) {
          renderer.dispose();
          dracoLoader.dispose();
          return;
        }
        scene.add(gltf.scene);

        // One material of ours for everything, and a ghost of it for the un-named rest. The
        // harvest already stripped the atlas's materials, so nothing here overrides an author.
        const solid = new three.MeshLambertMaterial({ color: BONE });
        const faded = new three.MeshLambertMaterial({
          color: BONE,
          depthWrite: false,
          opacity: FADED_OPACITY,
          transparent: true,
        });
        // 🔴 MATCHED ON NORMALISED NAMES, BECAUSE THE LOADER REWRITES THE REAL ONES. three's
        // GLTFLoader sanitises node names for its animation system — "Atlas (C1)" comes out with
        // its spaces and brackets mangled — while keeping the original in `userData.name`. An
        // exact-string set here matched nothing, so every bone ghosted and nothing was picked out;
        // measured on the first render, not guessed. Folding both sides to lowercase alphanumerics
        // makes the match immune to whatever the sanitiser does next release.
        const fold = (value: string | undefined): string =>
          (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const wanted = new Set(resolved.structures.map((name) => fold(name)));
        wanted.delete("");
        const isolating = wanted.size > 0;
        const nameOf = (node: { name: string; userData?: Record<string, unknown> }): string =>
          fold(typeof node.userData?.name === "string" ? node.userData.name : node.name);
        // 🔴 THE WHOLE ANCESTOR CHAIN, BECAUSE AN ORGAN IS A PARENT AND ITS PARTS ARE THE MESHES.
        // "Aorta" and "Apex of heart" are grouping nodes in the atlas; only their descendants
        // carry geometry. Checking one level up lit the arteries and missed the organs.
        const chosenBy = (node: InstanceType<typeof three.Object3D>): boolean => {
          for (let step: typeof node | null = node; step !== null; step = step.parent) {
            if (wanted.has(nameOf(step))) return true;
          }
          return false;
        };
        const picked: InstanceType<typeof three.Object3D>[] = [];
        gltf.scene.traverse((node) => {
          const mesh = node as InstanceType<typeof three.Mesh>;
          if (!mesh.isMesh) return;
          const chosen = chosenBy(node);
          mesh.material = isolating && !chosen ? faded : solid;
          if (isolating && chosen) picked.push(node);
        });

        // Frame what was asked for: the named structures when there are any, the region otherwise.
        const box = new three.Box3();
        if (picked.length > 0) for (const node of picked) box.expandByObject(node);
        else box.setFromObject(gltf.scene);
        const centre = box.getCenter(new three.Vector3());
        const sphere = box.getBoundingSphere(new three.Sphere());
        const distance = Math.max(0.05, (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.25);
        camera.position.set(centre.x + distance * 0.72, centre.y + distance * 0.35, centre.z + distance * 0.72);
        camera.lookAt(centre);

        scene.add(new three.AmbientLight(0xffffff, 1.4));
        const sun = new three.DirectionalLight(0xffffff, 1.8);
        sun.position.set(2, 4, 3);
        scene.add(sun);

        const draw = () => renderer.render(scene, camera);
        let controls: { dispose: () => void } | null = null;
        if (orbit) {
          const spun = new orbit.OrbitControls(camera, renderer.domElement);
          spun.target.copy(centre);
          spun.enablePan = false;
          spun.minDistance = distance * 0.3;
          spun.maxDistance = distance * 3;
          spun.addEventListener("change", draw);
          spun.update();
          controls = spun;
        }
        draw();
        setFailure(false);

        cleanup = () => {
          controls?.dispose();
          gltf.scene.traverse((node) => {
            const mesh = node as InstanceType<typeof three.Mesh>;
            if (mesh.isMesh) mesh.geometry?.dispose();
          });
          solid.dispose();
          faded.dispose();
          dracoLoader.dispose();
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
  }, [resolved]);

  if (!resolved) return null;
  if (failure) {
    return (
      <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">{visual.structure}</p>
    );
  }
  return (
    <div>
      <div ref={frame} aria-label={visual.learningGoal} role="img" />
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        <span className="font-mono">{visual.structure}</span>
        <span>
          {resolved.regionTitle}
          {resolved.structures.length > 1 ? ` · ${resolved.structures.length} structures picked out` : ""}
          {" · drag to turn it"}
        </span>
        <a
          className="underline decoration-(--ui-stroke-primary) underline-offset-2"
          href={credit.url}
          rel="noreferrer"
          target="_blank"
        >
          {credit.source} · {credit.licence}
        </a>
      </p>
    </div>
  );
}
