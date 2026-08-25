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
// 🔴 TYPE-ONLY, SO THE CHUNKING IS UNAFFECTED. These are erased at build; the dynamic `import()`
// calls below are still what decide that a lesson without an anatomy visual ships none of three.
import type { WebGLRenderTarget } from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";

import type { AnatomyVisual } from "@/lib/learn/canvas-visual";
// 🔴 THE LICENCE, NEVER THE REGISTRY. Four strings for the credit line; the atlas's structure
// names stay server-side, where the route matches them. See `anatomy-licence.ts`.
import { anatomyCredit } from "@/lib/learn/anatomy-licence";

const HEIGHT = 380;

/**
 * The atlas's own ivory, darkened — and the darkening is a fix, not a preference.
 *
 * 🔴 THIS USED TO BE 0xe0d9c8 AND IT RENDERED AS A FEATURELESS WHITE BLOB. Lambert shading
 * multiplies the base colour by the light, and the ambient term alone was 1.4. In the linear
 * working space three renders in, 0xe0d9c8 is about 0.75, so 0.75 x 1.4 = 1.05 — over 1.0, i.e.
 * clipped to pure white, BEFORE the directional light added anything at all. Every facet that was
 * not in deep shadow came out the same flat white, which is why the models read as smooth lumps
 * with no anatomy in them rather than as structures.
 *
 * Two numbers have to move together to fix that, and moving only one puts it straight back:
 * the base has to sit low enough that the brightest facet lands under 1.0, and the lights have to
 * sum to something that leaves a range rather than saturating. At 0.45 linear against a 0.62 +
 * 0.9 = 1.52 ceiling, the lit side reaches ~0.85 sRGB and the shadowed side ~0.57 — a real
 * gradient across the surface, which is the only thing carrying the form.
 *
 * Still theme-independent: a bone chart is one of the few objects that looks wrong inverted.
 */
const BONE = 0xb3a184;

/**
 * 🔴 0.14 WAS INVISIBLE. The ghost exists to say WHERE the named structure sits — a ventricle with
 * no heart around it is a bean. At 14% of a pale colour against a white canvas there was nothing
 * left to see, so the isolate-and-frame move lost its second half and the picture became one
 * floating shape. High enough to read as context, low enough not to compete with the subject.
 */
const FADED_OPACITY = 0.26;

/** The outline colour, matched to the warm orange Z-Anatomy draws its own plate lines in. */
const LINE: readonly [number, number, number] = [0.72, 0.28, 0.1];

/**
 * Edge detection over a structure-ID buffer, for the coloured regions.
 *
 * 🔴 IDS, NOT DEPTH OR NORMALS. A depth+normal edge pass is the obvious build and it draws the
 * silhouette and the hard creases but NOT the boundary between two structures that meet with a
 * continuous surface — which in a heart is most of the boundaries worth seeing. Rendering every
 * mesh in its own flat hue and looking for hue changes puts a line exactly where one structure
 * becomes another. The background stays black, so the outer silhouette falls out of the same test.
 *
 * The atlas draws these with Blender FREESTYLE — a render-time line pass, 12 linesets, not stored
 * in the file. So this is ours by necessity, not a port.
 */
const OUTLINE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tId: { value: null },
    texel: { value: null },
    lineColor: { value: null },
    thickness: { value: 1.9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tId;
    uniform vec2 texel;
    uniform vec3 lineColor;
    uniform float thickness;
    varying vec2 vUv;
    void main() {
      // 🔴 ALPHA IS CARRIED, NOT DISCARDED. This viewer renders with alpha enabled so the Canvas
      // surface shows through behind the model. Writing a flat 1.0 here turns the whole frame into
      // an opaque black rectangle sitting on the lesson.
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 here = texture2D(tId, vUv).rgb;
      vec2 off = texel * thickness;
      float diff = 0.0;
      diff = max(diff, length(here - texture2D(tId, vUv + vec2(-off.x, 0.0)).rgb));
      diff = max(diff, length(here - texture2D(tId, vUv + vec2( off.x, 0.0)).rgb));
      diff = max(diff, length(here - texture2D(tId, vUv + vec2(0.0, -off.y)).rgb));
      diff = max(diff, length(here - texture2D(tId, vUv + vec2(0.0,  off.y)).rgb));
      // A soft threshold; a hard step() aliases badly along curved silhouettes.
      float edge = smoothstep(0.015, 0.06, diff);
      gl_FragColor = vec4(mix(src.rgb, lineColor, edge * 0.92), max(src.a, edge));
    }
  `,
};

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
        // 🔴🔴 TWO DRESSING RULES, CHOSEN BY WHETHER THE FILE BROUGHT ITS OWN COLOUR. Z-Anatomy is
        // CC BY-SA 4.0 and its regions now ship with the atlas's own per-tissue colours — artery
        // red, vein blue, cardiac muscle, valve leaflet. Open3DModel's bones and the HRA organs
        // still arrive bare, because only Z-Anatomy's terms have been checked for materials, and
        // they keep the single bone colour this component has always used.
        //
        // Detected from the parsed glTF rather than from the loaded scene: three's GLTFLoader hands
        // every mesh a default white MeshStandardMaterial when a file has none, so asking the scene
        // "do you have materials?" always answers yes.
        const sourceCount = ((gltf.parser.json as { materials?: unknown[] }).materials ?? []).length;
        const coloured = sourceCount > 0;

        const bone = new three.MeshLambertMaterial({ color: BONE });
        const boneFaded = new three.MeshLambertMaterial({
          color: BONE,
          depthWrite: false,
          opacity: FADED_OPACITY,
          transparent: true,
        });
        const owned: InstanceType<typeof three.Material>[] = [bone, boneFaded];

        // One solid/ghost pair per source material, built once and shared — a heart has 22 meshes
        // across 6 materials, and a material per mesh would be 22 shader compiles for 6 looks.
        const dressed = new Map<
          string,
          { solid: InstanceType<typeof three.Material>; faded: InstanceType<typeof three.Material> }
        >();
        const dress = (src: InstanceType<typeof three.MeshStandardMaterial>) => {
          const key = src.uuid;
          const had = dressed.get(key);
          if (had) return had;
          const solid = new three.MeshPhysicalMaterial({
            color: src.color.clone(),
            roughness: 0.45,
            metalness: 0,
            // The sheen of a wet dissected surface, which is what an anatomical plate shows.
            clearcoat: 0.5,
            clearcoatRoughness: 0.35,
          });
          const faded = new three.MeshPhysicalMaterial({
            color: src.color.clone(),
            roughness: 0.6,
            metalness: 0,
            depthWrite: false,
            opacity: FADED_OPACITY,
            transparent: true,
          });
          const pair = { faded, solid };
          dressed.set(key, pair);
          owned.push(solid, faded);
          return pair;
        };
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
        /** Every mesh, in load order — the outline pass needs a stable id per structure. */
        const lit: InstanceType<typeof three.Mesh>[] = [];
        /** Whether each entry of `lit` is one of the named structures. See the ID pass below. */
        const litChosen: boolean[] = [];
        gltf.scene.traverse((node) => {
          const mesh = node as InstanceType<typeof three.Mesh>;
          if (!mesh.isMesh) return;
          const chosen = chosenBy(node);
          const pair = coloured
            ? dress(mesh.material as InstanceType<typeof three.MeshStandardMaterial>)
            : { faded: boneFaded, solid: bone };
          mesh.material = isolating && !chosen ? pair.faded : pair.solid;
          if (isolating && chosen) picked.push(node);
          lit.push(mesh);
          litChosen.push(chosen);
        });

        // Frame what was asked for: the named structures when there are any, the region otherwise.
        const box = new three.Box3();
        if (picked.length > 0) for (const node of picked) box.expandByObject(node);
        else box.setFromObject(gltf.scene);
        const centre = box.getCenter(new three.Vector3());
        const sphere = box.getBoundingSphere(new three.Sphere());
        // 🔴 THE OFFSET IS NORMALISED, AND IT WAS NOT. `distance` is the range that fits the
        // subject in the vertical field of view, but it was then used as three separate
        // components — (0.72, 0.35, 0.72) — and that vector is 1.077 long, not 1. So the camera
        // always sat ~8% further back than the fit it had just computed, on top of a 1.25 padding
        // factor, and the subject came out noticeably small in a large empty frame. Scaling a unit
        // direction makes the number mean what it says, and the padding can then be the modest
        // margin it was meant to be.
        // 🔴 THE PADDING HAS TO KNOW WHETHER THERE ARE LABELS. The camera frames the picked
        // structures; a name sits OUTSIDE them on a leader, so at the tight padding the label lands
        // off-screen and all the reader sees is a line leaving the frame. Wider only when labelled.
        const labelling = picked.length > 0 && sourceCount > 0;
        const pad = labelling ? 1.75 : 1.12;
        const distance = Math.max(0.05, (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * pad);
        const eye = new three.Vector3(0.72, 0.35, 0.72).normalize().multiplyScalar(distance);
        camera.position.copy(centre).add(eye);
        camera.lookAt(centre);

        // 🔴 THESE TWO SUM TO THE EXPOSURE, AND THEY WERE 1.4 + 1.8. See the note on BONE: at
        // those levels the surface saturates and the shading that describes the shape is thrown
        // away. Raising either one back without darkening BONE restores the white blob.
        scene.add(new three.AmbientLight(0xffffff, coloured ? 0.35 : 0.62));
        const sun = new three.DirectionalLight(0xffffff, coloured ? 0.75 : 0.9);
        sun.position.set(2, 4, 3);
        scene.add(sun);

        // 🔴 IMAGE-BASED LIGHTING IS WHAT MAKES TISSUE LOOK WET RATHER THAN PLASTIC. A lamp on a
        // smooth surface gives one hard highlight; an environment gives the broad soft sheen an
        // anatomical plate has. Generated from three's own room, so there is no asset and nothing
        // to license. Only the coloured regions want it — a bone chart reads better matte.
        let pmrem: InstanceType<typeof three.PMREMGenerator> | null = null;
        let envRT: { texture: { dispose: () => void } } | null = null;
        if (coloured) {
          const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
          pmrem = new three.PMREMGenerator(renderer);
          envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
          scene.environment = envRT.texture as never;
          scene.environmentIntensity = 0.55;
        }

        // ── the outline pass, and the labels that ride over it ──────────────────────────────
        const dpr = renderer.getPixelRatio();
        const hud = new three.Scene();
        let composer: EffectComposer | null = null;
        let idTarget: WebGLRenderTarget | null = null;
        const idMaterials: InstanceType<typeof three.Material>[] = [];

        if (coloured) {
          const [{ EffectComposer }, { RenderPass }, { ShaderPass }, { OutputPass }, spriteMod] =
            await Promise.all([
              import("three/examples/jsm/postprocessing/EffectComposer.js"),
              import("three/examples/jsm/postprocessing/RenderPass.js"),
              import("three/examples/jsm/postprocessing/ShaderPass.js"),
              import("three/examples/jsm/postprocessing/OutputPass.js"),
              import("three-spritetext"),
            ]);
          const SpriteText = spriteMod.default;

          // 🔴 THE OUTLINE TRACES WHAT IS IN FOCUS, NOT THE CONTEXT — AND THAT IS NOT A STYLE
          // CHOICE. Give every mesh its own id while isolating and the pass draws a line around
          // all of them: on the nervous system that is 335 ghosted structures, and the brain
          // arrives under a tangle of orange scribble with the named structure lost inside it.
          // Ghosted meshes therefore SHARE one id, so no line is drawn between two of them and the
          // context keeps only its outer silhouette, while each named structure still gets its own.
          const context = new three.MeshBasicMaterial({
            color: new three.Color().setHSL(0.58, 0.25, 0.45),
            side: three.DoubleSide,
          });
          let hue = 0;
          for (let i = 0; i < lit.length; i += 1) {
            if (isolating && !litChosen[i]) {
              idMaterials.push(context);
              continue;
            }
            // Spread around the hue circle so neighbouring structures never land on close values.
            hue += 1;
            idMaterials.push(
              new three.MeshBasicMaterial({
                color: new three.Color().setHSL((hue * 0.147) % 1, 0.9, 0.5),
                side: three.DoubleSide,
              }),
            );
          }
          owned.push(context);

          idTarget = new three.WebGLRenderTarget(
            Math.round(width * dpr),
            Math.round(HEIGHT * dpr),
            { magFilter: three.NearestFilter, minFilter: three.NearestFilter },
          );

          const made = new EffectComposer(renderer);
          made.setPixelRatio(dpr);
          made.setSize(width, HEIGHT);
          made.addPass(new RenderPass(scene, camera));
          const outline = new ShaderPass(OUTLINE_SHADER);
          const u = outline.uniforms as Record<string, { value: unknown }>;
          u.tId!.value = idTarget.texture;
          u.texel!.value = new three.Vector2(1 / (width * dpr), 1 / (HEIGHT * dpr));
          u.lineColor!.value = new three.Color(LINE[0], LINE[1], LINE[2]);
          made.addPass(outline);
          made.addPass(new OutputPass());
          composer = made;

          // 🔴 LEADER LINES, NOT NAMES STACKED ON TOP OF THE THING. Two structures that overlap on
          // screen put their names in the same few pixels, and a label you cannot read against the
          // part it names is worse than no label. Each name sits out along the direction from the
          // region's centre to its own structure, with a hairline back to it — which is what a
          // printed plate does, and is checkable: a leader pointing at the wrong lobe shows.
          for (const node of picked) {
            const box = new three.Box3().setFromObject(node);
            const at = box.getCenter(new three.Vector3());
            const away = at.clone().sub(centre);
            if (away.lengthSq() < 1e-8) away.set(0, 1, 0);
            const anchor = at.clone().add(away.normalize().multiplyScalar(sphere.radius * 0.95));
            const name = typeof node.userData?.name === "string" ? node.userData.name : node.name;
            const label = new SpriteText((name || "").replace(/_/g, " "), sphere.radius * 0.075, "#141414");
            label.position.copy(anchor);
            label.material.depthTest = false;
            hud.add(label);
            const leader = new three.Line(
              new three.BufferGeometry().setFromPoints([at, anchor]),
              new three.LineBasicMaterial({ color: 0x141414, opacity: 0.4, transparent: true }),
            );
            leader.material.depthTest = false;
            hud.add(leader);
          }
        }

        const draw = () => {
          if (!composer || !idTarget) {
            renderer.render(scene, camera);
            return;
          }
          // The ID buffer: every structure in its own flat hue, nothing else in the frame.
          const restore = lit.map((mesh) => mesh.material);
          lit.forEach((mesh, i) => (mesh.material = idMaterials[i]!));
          renderer.setRenderTarget(idTarget);
          renderer.setClearColor(0x000000, 1);
          renderer.clear();
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          renderer.setClearColor(0x000000, 0);
          lit.forEach((mesh, i) => (mesh.material = restore[i]!));

          composer.render();

          // 🔴 THE LABELS LIVE IN THEIR OWN SCENE, DRAWN LAST. Left in the main scene a sprite is
          // still a quad with depth, so the outline pass rings each name in orange and any
          // occlusion pass paints a box behind it. Out of the scene, neither can see them.
          renderer.autoClear = false;
          renderer.render(hud, camera);
          renderer.autoClear = true;
        };
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
          // Everything constructed here is released, the Mol* discipline this file opens with: a
          // WebGL context is a resource the browser counts, and so is every compiled shader.
          for (const material of owned) material.dispose();
          for (const material of idMaterials) material.dispose();
          hud.traverse((node) => {
            const sprite = node as InstanceType<typeof three.Sprite>;
            if (sprite.isSprite) {
              sprite.material.map?.dispose();
              sprite.material.dispose();
            }
            const line = node as InstanceType<typeof three.Line>;
            if (line.isLine) {
              line.geometry?.dispose();
              (line.material as { dispose: () => void }).dispose();
            }
          });
          idTarget?.dispose();
          composer?.dispose();
          envRT?.texture.dispose();
          pmrem?.dispose();
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
