"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { ChromeBlob } from "@/components/ChromeBlob";

import { CURL_3D, FBM_3D, SIMPLEX_3D } from "./noise";
import { ease, mixStates, STATES, type OrganismState, type StateName } from "./states";

/**
 * The Nemesis organism — the living form of the mark.
 *
 * A shell of points transported by a curl-noise flow field. Because the curl of a
 * field is divergence-free, the flow can only CARRY points; it can never pile
 * them up or tear them apart. The result is a body that continuously reorganises
 * itself while staying one object, which is the entire reason this technique was
 * chosen over the seven alternatives in the lab: the metaphor is doing real work,
 * not being illustrated.
 *
 * ── WHAT IT RESPONDS TO ───────────────────────────────────────────────────────
 *
 *   at rest        slow, coherent evolution
 *   cursor near    the form reorganises, blended by DISTANCE not by a threshold
 *   section        the page tells it what is being learned and it changes shape
 *
 * ── WHY THERE IS A FALLBACK ───────────────────────────────────────────────────
 *
 * This is the first thing a visitor sees. A hero visual that fails to initialise
 * cannot leave a hole where the product's identity should be, so anything that
 * makes the live object wrong or unwelcome — no WebGL, a lost context, or a
 * stated preference for reduced motion — falls back to the static ChromeBlob,
 * which is the same character drawn in vector.
 */

type Props = {
  /** Which state to ease toward. The page drives this as the visitor scrolls. */
  readonly state?: StateName;
  /** CSS size. The object scales to fill it. */
  readonly size?: number;
  /** Whether the cursor should reorganise it. Off for small decorative instances. */
  readonly interactive?: boolean;
  readonly className?: string;
};

/** Latitude rings. The rows are in the buffer; the flow field is what curves them. */
const BANDS = 58;
const ALONG = 300;

/** How far from the object's centre the cursor starts to be felt, in CSS pixels. */
const ATTEND_RADIUS = 380;

function buildLattice(): { position: Float32Array; jitter: Float32Array; count: number } {
  const positions: number[] = [];
  const jitter: number[] = [];

  // A deterministic hash rather than Math.random(): the object must look the same
  // on the server-rendered first paint and every reload, and a random buffer also
  // makes any visual regression impossible to reproduce.
  let seed = 20260815;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let b = 0; b < BANDS; b++) {
    const v = (b + 0.5) / BANDS;
    const phi = v * Math.PI;
    const ringRadius = Math.sin(phi);
    const y = Math.cos(phi);

    // Points PER RING scale with the ring's circumference, so spacing along a row
    // is even instead of bunching to a knot at the poles.
    const n = Math.max(3, Math.round(ALONG * ringRadius));
    for (let a = 0; a < n; a++) {
      const theta = (a / n) * Math.PI * 2;
      positions.push(Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius);
      jitter.push(rand());
    }
  }

  return {
    position: new Float32Array(positions),
    jitter: new Float32Array(jitter),
    count: jitter.length,
  };
}

const VERTEX = /* glsl */ `
${SIMPLEX_3D}
${FBM_3D}
${CURL_3D}

uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uFlow;
uniform float uFreq;
uniform float uShell;
uniform float uRelief;
uniform float uCamDist;
uniform float uOpacity;

/** Per-point jitter in 0..1. See gl_PointSize below for what it buys. */
attribute float aJitter;
varying float vAlpha;

void main() {
  vec3 n = normalize(position);

  vec3 q = n * uFreq + vec3(0.0, uTime * 0.06, 0.0);
  vec3 raw = curl3(q, 0.12);

  // BOUND the transport. curl3 finite-differences over eps and divides by 2*eps,
  // so its raw magnitude runs to several units — larger than the object's radius.
  // Feeding that in directly scattered every point into open space and destroyed
  // the silhouette. Take the DIRECTION from the field and let its magnitude only
  // modulate the step, so "flow" means a real fraction of the radius.
  float mag = length(raw);
  vec3 dir = mag > 1e-5 ? raw / mag : vec3(0.0);
  float step = 0.35 + 0.65 * clamp(mag * 0.3, 0.0, 1.0);
  vec3 flow = dir * step;

  // Strip out as much radial motion as the shell setting asks for.
  flow -= n * dot(flow, n) * uShell;

  vec3 moved = normalize(n + flow * uFlow);
  float h = fbm3(n * 1.1 + vec3(0.0, uTime * 0.04, 0.0), 3, 2.0, 0.5);
  vec3 pos = moved * (1.0 + uRelief * h);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(0.001, -mv.z);
  float speed = clamp(step, 0.0, 1.0);

  // The jitter is small (±12%) and load-bearing. A lattice of identically sized
  // dots reads as a manufactured mesh — the eye locks onto the grid rather than
  // the form. Breaking the sizes very slightly is what makes it read as organic.
  float jitter = 0.88 + 0.24 * aJitter;
  gl_PointSize = uSize * uPixelRatio * (uCamDist / dist) * (0.85 + 0.5 * speed) * jitter;

  // Depth reads as opacity. No fog, no glow — nearer is simply more present.
  float depth01 = clamp((dist - (uCamDist - 1.7)) / 3.4, 0.0, 1.0);
  vAlpha = mix(1.0, 0.16, depth01) * (0.6 + 0.4 * speed) * uOpacity;
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uInk;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.36, 0.5, d)) * vAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(uInk, a);
}
`;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function NemesisOrganism({
  state = "rest",
  size = 460,
  interactive = true,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<StateName>(state);
  const [fallback, setFallback] = useState<null | "reduced" | "unsupported">(null);

  stateRef.current = state;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setFallback("reduced");
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    // A canvas created imperatively, never by React. Teardown calls
    // forceContextLoss(), and a canvas ELEMENT whose context has been force-lost
    // can never get another one. React StrictMode mounts effects twice in
    // development, so a React-owned canvas would be killed by the first cleanup
    // and handed straight back to the second mount, crashing on a null context.
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch {
      setFallback("unsupported");
      return;
    }

    host.appendChild(canvas);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearAlpha(0);

    const lattice = buildLattice();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(lattice.position, 3));
    geometry.setAttribute("aJitter", new THREE.BufferAttribute(lattice.jitter, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.2);

    const readInk = () => new THREE.Color(getComputedStyle(host).color || "#000");

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uSize: { value: STATES.rest.size },
      uPixelRatio: { value: pixelRatio },
      uFlow: { value: STATES.rest.flow },
      uFreq: { value: STATES.rest.freq },
      uShell: { value: STATES.rest.shell },
      uRelief: { value: STATES.rest.relief },
      uCamDist: { value: 5 },
      // Fully present from the first frame. An earlier version eased this up from
      // zero over ~0.7s, which looked good and was a genuine liability: the fade
      // is driven by elapsed FRAMES, so anywhere rAF is throttled — a background
      // tab, a reduced-power mode, an embedded webview — the hero simply never
      // became visible. The page's own `.reveal` class already carries the
      // entrance, as a transform, and one entrance is enough.
      uOpacity: { value: 1 },
      uInk: { value: readInk() },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      // The dots are translucent, so depth testing would punch holes through the
      // surface where nearer points occlude further ones. Depth reads as opacity.
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    const scene = new THREE.Scene();
    scene.add(points);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 5);

    const fit = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(host);

    // Theme is an attribute on :root, so the ink has to be re-read when it flips —
    // a colour sampled once at mount would leave the object black on black.
    const themeObserver = new MutationObserver(() => {
      uniforms.uInk!.value = readInk();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    // Offscreen and background tabs render nothing. A hero animation that keeps
    // burning GPU while the visitor reads the footer is a battery cost with no
    // viewer, and this object is the most expensive thing on the page.
    let onScreen = true;
    const intersection = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: "120px" },
    );
    intersection.observe(host);

    // Pointer is tracked on the WINDOW, not the canvas: the object has to feel the
    // cursor approaching from outside its own box, which a canvas-local listener
    // cannot see.
    let pointer: { x: number; y: number } | null = null;
    const onPointerMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    if (interactive) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }

    // Eased values live here, NOT in the uniforms, so easing is independent of
    // what the shader last read.
    let current: OrganismState = { ...STATES.rest };
    let clock = 0;
    let last = performance.now();
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);

      const nowMs = performance.now();
      // Clamped: a backgrounded tab produces a multi-second delta on return, which
      // would jump the flow field forward and read as a glitch.
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;

      // Only the intersection check. A `document.hidden` guard was here too and was
      // removed: browsers already stop rAF in a hidden tab, so it bought nothing
      // there, while in an EMBEDDED webview — which reports hidden but still gets
      // frames — it silently rendered a blank hero forever.
      if (!onScreen) return;

      let target: OrganismState = STATES[stateRef.current];

      if (interactive && pointer) {
        const rect = host.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const distance = Math.hypot(pointer.x - cx, pointer.y - cy);
        // Proximity, not a threshold: attention arrives gradually as the cursor
        // approaches. A binary hover would read as a UI affordance.
        const nearness = Math.max(0, 1 - distance / ATTEND_RADIUS);
        if (nearness > 0) target = mixStates(target, STATES.attend, nearness * nearness);
      }

      // Slower on the way in than the way out would be asymmetric; one constant
      // keeps every transition feeling like the same material.
      const tau = 0.55;
      current = {
        flow: ease(current.flow, target.flow, dt, tau),
        freq: ease(current.freq, target.freq, dt, tau),
        shell: ease(current.shell, target.shell, dt, tau),
        relief: ease(current.relief, target.relief, dt, tau),
        speed: ease(current.speed, target.speed, dt, tau),
        size: ease(current.size, target.size, dt, tau),
      };

      // Time ACCUMULATES scaled by speed rather than being multiplied by it.
      // Multiplying absolute time means every speed change teleports the flow
      // field to a different point in its evolution.
      clock += dt * current.speed;

      uniforms.uTime!.value = clock;
      uniforms.uFlow!.value = current.flow;
      uniforms.uFreq!.value = current.freq;
      uniforms.uShell!.value = current.shell;
      uniforms.uRelief!.value = current.relief;
      uniforms.uSize!.value = current.size;

      points.rotation.y = clock * 0.045;
      points.rotation.x = 0.19 + Math.sin(clock * 0.13) * 0.06;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setFallback("unsupported");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection.disconnect();
      if (interactive) {
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerleave", onPointerLeave);
      }
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      // Both, in this order. dispose() releases three.js's objects but leaves the
      // browser holding the context until GC runs, and the per-page context budget
      // is small enough that remounts can exhaust it.
      renderer.forceContextLoss();
      renderer.dispose();
      canvas.remove();
    };
  }, [interactive]);

  if (fallback) {
    return (
      <div className={className} style={{ width: size, height: size }} aria-hidden="true">
        <ChromeBlob state="idle" size={size} />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={className}
      // `color` is what the shader samples for its ink, which is how the object
      // follows the theme without knowing anything about the theme.
      style={{ width: size, height: size, color: "var(--text)" }}
      aria-hidden="true"
    />
  );
}
