"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clamp01, ease, lerp, window01 } from "../progress";

/**
 * Scene 2 — the same idea, in space.
 *
 * The diagram above could tell you the order of the circuit and nothing about
 * the shape of the organ. This is the Canvas deciding that space now explains
 * more than boxes do, so it stops drawing arrows and turns the thing around.
 *
 * ── WHAT THE MODEL IS, AND WHAT THAT COSTS ────────────────────────────────────
 *
 * NIH 3D entry 3DPX-022787, public domain, bundled locally at
 * /model/heart.glb. Provenance and the optimisation steps are in
 * public/model/README.md. Two properties of that file shape this whole file:
 *
 * It carries POSITION only, with no normals, so the mesh renders black until
 * computeVertexNormals runs.
 *
 * It is ONE fused mesh — one node, one primitive, no named structures. So
 * "dim the irrelevant anatomy" cannot mean hiding a sub-mesh, because there are
 * none. Emphasis is spatial instead: a focus point in model space, and a shader
 * that fades the surface toward the page background with distance from it.
 *
 * Fading toward the background rather than toward transparency is deliberate.
 * Real transparency on a single closed mesh sorts against itself — you would
 * see the inside of the far wall through the near one, which on an organ looks
 * like a rendering fault rather than like emphasis.
 *
 * ── THE LABEL IS A CLAIM, SO IT IS A CAREFUL ONE ──────────────────────────────
 *
 * The apex of the heart is formed by the left ventricle. That is true of any
 * heart, which means it stays true of a generatively authored model whose finer
 * anatomy nobody has verified. Emphasising the apex and naming it is a claim
 * this scene can actually support; pointing at a valve or a named artery in
 * this mesh would not be.
 */

const VERT = `
  varying vec3 vNormal;
  varying vec3 vModelPos;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vModelPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  precision highp float;
  uniform vec3 uLit;
  uniform vec3 uShadow;
  uniform vec3 uBg;
  uniform vec3 uFocus;
  uniform float uFocusAmt;
  uniform float uRadius;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform float uTint;
  uniform float uSideSign;
  uniform float uFlowT;
  varying vec3 vNormal;
  varying vec3 vModelPos;
  varying vec3 vViewDir;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);

    // TWO-SIDED. The source file carries no normals, and computeVertexNormals
    // on a welded, decimated mesh leaves a large share of them pointing inward.
    // The result was that the surface facing the camera was the surface facing
    // away from the light: diffuse pinned to zero, the organ rendered flat at
    // its ambient floor, and in dark mode that floor is very nearly the page.
    // Flipping any normal that points away from the viewer is valid on a closed
    // surface, where the visible side is by definition the near side.
    if (dot(n, v) < 0.0) n = -n;

    vec3 l = normalize(vec3(0.45, 0.8, 0.75));
    float diff = clamp(dot(n, l), 0.0, 1.0);

    // Rim term, so the silhouette stays legible against a flat page instead of
    // dissolving into it at the edges.
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);

    // Low ambient and a strong diffuse term: with ambient at 0.30 the surface
    // saturated to uLit almost everywhere and the form flattened out.
    float intensity = clamp(0.16 + diff * 0.92 + rim * 0.26, 0.0, 1.0);
    vec3 shaded = mix(uShadow, uLit, intensity);

    /* ── OXYGENATED AND DEOXYGENATED ────────────────────────────────────────
       Red for the systemic side, blue for the pulmonary side, assigned by which
       half of the model a fragment sits in — the right heart carries returning
       deoxygenated blood, the left sends oxygenated blood out, and that is true
       of any heart. uSideSign says which way round X runs on this particular
       mesh; it was set by looking at the render, not assumed.

       SPATIAL, BECAUSE THE MESH HAS NO PARTS. One fused primitive, no named
       structures, so there is no aorta to select and paint. That is also why the
       colour stays a tint over the grey rather than becoming the surface: the
       model can support "this side handles oxygenated blood", which is anatomy,
       but not "this tube is the aorta", which would be a claim about geometry
       nobody has verified.

       WEIGHTED TOWARD THE VESSELS. The distinction is most meaningful where the
       great vessels leave the top of the heart, so the tint fades out down the
       ventricular mass. Capped well below full saturation — a heart that is
       half fire-engine red and half primary blue is a plastic teaching model,
       and the brief asks for restraint. */
    /* SPLIT ON Z, NOT X. The camera settles at yaw 270, which places it on the
       -X axis looking along +X — so X is the DEPTH axis from the viewer and Z is
       what runs left-to-right across the screen. Splitting on X put the whole
       red/blue distinction front-to-back where none of it is visible, and the
       heart came out a uniform pale violet that said nothing. */
    float side = clamp(vModelPos.z * uSideSign * 3.4, -1.0, 1.0);
    float superior = smoothstep(-0.12, 0.30, vModelPos.y);

    /* Flow, as a soft band travelling along the vessels — up the systemic side
       (leaving) and down the pulmonary side (returning). Cubed so it reads as a
       pulse passing through rather than as stripes. */
    float phase = vModelPos.y * 5.2 - uFlowT * 1.5 * sign(side == 0.0 ? 1.0 : side);
    float pulse = pow(0.5 + 0.5 * sin(phase), 3.0);

    vec3 blood = mix(uCool, uWarm, side * 0.5 + 0.5);
    float amount = uTint * superior * 0.62;
    vec3 painted = mix(shaded, blood * (0.72 + 0.5 * intensity + 0.35 * pulse), amount);

    // Distance from the focus, in model units. Everything beyond uRadius sinks
    // toward the page; everything inside keeps full contrast. The floor is 0.5
    // rather than 0.26 — at 0.26 the unfocused anatomy did not recede, it
    // disappeared, and an organ with its top half missing reads as a rendering
    // fault rather than as emphasis.
    float d = distance(vModelPos, uFocus);
    float near = 1.0 - smoothstep(uRadius * 0.45, uRadius, d);
    float keep = mix(1.0, mix(0.5, 1.0, near), uFocusAmt);

    gl_FragColor = vec4(mix(uBg, painted, keep), 1.0);
  }
`;

/**
 * Where the apex sits in model space.
 *
 * The file is normalised to unit height and centred on the origin, with +Y
 * superior (the great vessels) and the ventricular mass below. The apex is the
 * low, forward, patient-left corner of that mass. Tuned by eye against the
 * render — the mesh has no landmarks to derive it from.
 */
const APEX = new THREE.Vector3(0.1, -0.3, 0.12);

type Keyframe = { readonly at: number; readonly yaw: number; readonly pitch: number; readonly dist: number };

/**
 * Camera choreography. Yaw 270° is the anatomical front of this model, checked
 * against a four-angle render before any of this was written.
 *
 * It arrives off-axis and turns to face you rather than starting square on,
 * because the turn is what says the object is being examined rather than
 * displayed. It then pushes in on the apex as the emphasis lands.
 */
const CAMERA: readonly Keyframe[] = [
  { at: 0.0, yaw: 218, pitch: 8, dist: 2.35 },
  { at: 0.42, yaw: 270, pitch: 2, dist: 2.05 },
  { at: 0.72, yaw: 284, pitch: -6, dist: 1.95 },
  // Stops at 1.8, not 1.5. The model is one unit tall and a 34-degree lens at
  // 1.5 shows only 0.92 of a unit, so the push-in was cropping the apex — which
  // is the structure the label is pointing at.
  { at: 1.0, yaw: 292, pitch: -10, dist: 1.8 },
];

function cameraAt(t: number): Keyframe {
  let a = CAMERA[0]!;
  let b = CAMERA[CAMERA.length - 1]!;
  for (let i = 0; i < CAMERA.length - 1; i++) {
    const lo = CAMERA[i]!;
    const hi = CAMERA[i + 1]!;
    if (t >= lo.at && t <= hi.at) {
      a = lo;
      b = hi;
      break;
    }
  }
  const span = b.at - a.at;
  const k = ease(span <= 0 ? 1 : clamp01((t - a.at) / span));
  return { at: t, yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), dist: lerp(a.dist, b.dist, k) };
}

/** Is this palette a dark one? Decides which way round lit and shadow go. */
function luminance(rgb: THREE.Color): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

export function AnatomyScene({
  t,
  armed,
  active,
  reduced,
}: {
  readonly t: number;
  readonly armed: boolean;
  readonly active: boolean;
  readonly reduced: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  /**
   * The label tracks the apex, which means its position changes every frame the
   * camera moves. It is written straight to the node rather than held in state:
   * a setState per frame would re-render this component sixty times a second,
   * and React would be doing reconciliation work to move one span.
   */
  const labelRef = useRef<HTMLSpanElement>(null);

  // The scene reads progress every frame; keeping it in a ref means changing it
  // never re-runs the effect that owns the WebGL context.
  const tRef = useRef(t);
  tRef.current = t;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!armed) return;
    const host = hostRef.current;
    if (!host) return;

    // Created imperatively, not rendered by React. A canvas whose context has
    // been force-lost can never get another one, so a React-owned canvas dies
    // on StrictMode's second mount.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    host.appendChild(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);

    const styles = getComputedStyle(host);
    const bg = new THREE.Color(styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)" ? styles.backgroundColor : getComputedStyle(document.body).backgroundColor || "#ffffff");
    const dark = luminance(bg) < 0.5;

    const uniforms = {
      // The two palettes are not mirror images, because "recede toward the
      // page" means something different in each. On black, receding is going
      // darker and the lit tone can sit near white. On white, receding is going
      // LIGHTER — so the lit tone has to start well down in the greys or the
      // emphasis has nowhere to travel and the whole organ washes out. #8b877f
      // was still too close to the page; this is two stops darker.
      uLit: { value: new THREE.Color(dark ? "#f4f4f1" : "#6b675f") },
      uShadow: { value: new THREE.Color(dark ? "#42423e" : "#141412") },
      uBg: { value: bg },
      uFocus: { value: APEX.clone() },
      uFocusAmt: { value: 0 },
      uRadius: { value: 0.42 },
      // Muted on purpose. Full-saturation red and blue on a monochrome page
      // would be the loudest thing on the site by a distance, and the brief is
      // for these to communicate flow rather than to decorate.
      uWarm: { value: new THREE.Color(dark ? "#c4564d" : "#a8443c") },
      uCool: { value: new THREE.Color(dark ? "#5b81b4" : "#3f6091") },
      uTint: { value: 0 },
      // Which way round X runs on this mesh: +1 if the patient's left (the
      // oxygenated side) is at +X. Verified against the render rather than
      // assumed, because the model carries no orientation metadata.
      uSideSign: { value: 1 },
      uFlowT: { value: 0 },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
    });

    let disposed = false;
    let raf = 0;

    new GLTFLoader().load(
      "/model/heart.glb",
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          // No NORMAL attribute in the source; without this the mesh is black.
          m.geometry.computeVertexNormals();
          m.material = material;
        });
        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        pivot.add(model);
        setReady(true);
      },
      undefined,
      () => setFailed(true),
    );

    const fit = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    const project = new THREE.Vector3();
    // The blood-flow band is the one thing here that moves on its own clock
    // rather than from the scene's progress, because flow is continuous — it
    // should not stall the moment the sequence pauses on a held frame.
    let lastFrame = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (!activeRef.current) return;

      const p = tRef.current;
      const k = cameraAt(p);
      const yaw = (k.yaw * Math.PI) / 180;
      const pitch = (k.pitch * Math.PI) / 180;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * k.dist,
        Math.sin(pitch) * k.dist,
        Math.cos(yaw) * Math.cos(pitch) * k.dist,
      );
      camera.lookAt(0, 0, 0);

      // The order is the lesson: the form arrives, it turns to face you, THEN
      // the circulation is colour-coded, then one region is singled out. Landing
      // the colour before the camera has settled would make it decoration; after
      // the turn it reads as the next thing being explained.
      uniforms.uTint.value = ease(window01(p, 0.3, 0.52));
      uniforms.uFlowT.value += dt * 1.6;

      // Emphasis arrives after the camera has settled into the front view, so
      // the two moves read as one decision rather than as two effects.
      uniforms.uFocusAmt.value = ease(window01(p, 0.52, 0.72));
      uniforms.uRadius.value = lerp(0.5, 0.34, ease(window01(p, 0.64, 1)));

      // Idle breathing, so a reader who stops scrolling is not looking at a
      // still. Suppressed under reduced-motion, where the scroll-driven camera
      // is still fine because the reader is the one moving it.
      pivot.rotation.y = reduced ? 0 : Math.sin(p * Math.PI * 2) * 0.03;

      renderer.render(scene, camera);

      const label = labelRef.current;
      if (label) {
        project.copy(APEX).project(camera);
        const opacity = ease(window01(p, 0.5, 0.64));
        label.style.opacity = String(opacity);
        if (opacity > 0.001) {
          // Percentages of the container, via left/top on an absolutely
          // positioned span. A percentage translate() would resolve against the
          // span's own width and move it by a fraction of the text instead.
          label.style.left = `${((project.x + 1) / 2) * 100}%`;
          label.style.top = `${((1 - project.y) / 2) * 100}%`;
        }
      }
    };
    raf = requestAnimationFrame(frame);

    const onLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      material.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, [armed, reduced]);

  return (
    <div className="shw-3d" ref={hostRef}>
      {failed && <p className="shw-3d-fallback">the heart, in three dimensions</p>}
      {!failed && !ready && <p className="shw-3d-fallback shw-3d-loading">loading</p>}
      {/* Rendered with zero opacity and moved by the frame loop — mounting it on
          a threshold would put a React commit in the middle of the camera move.
          Gated on `ready` all the same: the sequence runs on a clock and does
          not wait for the model, so on a slow connection the scene can reach the
          annotation step with nothing to annotate, and a label pointing at empty
          space next to the word "loading" reads as a broken page. */}
      {!failed && ready && (
        <span className="shw-3d-label" ref={labelRef} style={{ opacity: 0 }} aria-hidden="true">
          left ventricle
        </span>
      )}
    </div>
  );
}
