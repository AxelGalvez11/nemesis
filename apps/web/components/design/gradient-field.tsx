"use client";

import { useEffect, useRef } from "react";

/**
 * A gradient rendered by a WebGL fragment shader.
 *
 * 🔴 THIS EXISTS BECAUSE CSS COULD NOT DO IT, AND FOUR ATTEMPTS PROVED IT.
 * v1 stacked radial gradients with a noise overlay — owner: "the gradients suck ... not just a
 * bunch of blobs." v2 added SVG displacement warping and blend modes. v3 retuned the ranges. v4
 * did single-hue neon with three-stage bloom. Owner: "your gradients have black in them, it was
 * supposed to be one color" and "did you even use shaders?"
 *
 * Both notes were right. CSS can only stack fixed shapes, so form has to come from a list of
 * circles; and every CSS version reached its dark end by falling to black, which makes a
 * "single-hue" gradient secretly two colours. x.ai runs a WebGL canvas on their own homepage —
 * measured 568x417, webgl2 — which is the tell that this is the medium for the job.
 *
 * What the shader does that CSS cannot:
 *   - Evaluates a FIELD per pixel, so shape comes from noise rather than from stacked ellipses.
 *   - Domain warping (fbm of an fbm of an fbm, Inigo Quilez's method) folds the field into itself
 *     and produces flowing structure no arrangement of gradients reaches.
 *   - Interpolates in OKLCH, holding ONE hue while lightness runs 0.42 to 0.99 and chroma peaks in
 *     the mid-lights. The darkest pixel is a deep saturated version of the colour, never black.
 *   - Dithers its own output by ±1/255, which removes the banding an 8-bit framebuffer shows.
 *
 * 🔴 THE RAMP IS THE GRADIENT AND THE NOISE ONLY BENDS IT. The first shader had no large-scale
 * lightness ramp, so every pixel sat in the midtones and the result read as marble, not gradient.
 * The smooth falloff from `lightPos` is what the eye reads as light; the warp displaces it.
 *
 * For hero-scale artwork prefer a rendered image (Higgsfield) — the references all ship rendered
 * assets, not procedural fields. This is for surfaces where a rendered asset is overkill and
 * where being live and themeable is worth more than being photographic.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res; uniform float u_t, u_hue, u_chroma;

vec2 hash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i + vec2(0,0)), f - vec2(0,0)), dot(hash(i + vec2(1,0)), f - vec2(1,0)), u.x),
             mix(dot(hash(i + vec2(0,1)), f - vec2(0,1)), dot(hash(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++){ v += a * noise(p); p = r * p * 2.02; a *= 0.5; } return v; }

float warped(vec2 p, out vec2 q, out vec2 s){
  q = vec2(fbm(p + 0.06 * u_t), fbm(p + vec2(5.2, 1.3) - 0.05 * u_t));
  s = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.04 * u_t), fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.03 * u_t));
  return fbm(p + 4.0 * s);
}

vec3 oklch2linear(float L, float C, float hDeg){
  float h = radians(hDeg); float a = C * cos(h), b = C * sin(h);
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
  return clamp(vec3( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
                    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
                    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(12.92*c, 1.055*pow(max(c,1e-5), vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.1;

  vec2 q, s;
  float w = clamp(warped(p, q, s) * 0.5 + 0.5, 0.0, 1.0);

  vec2 lightPos = vec2(0.26, 0.80);
  float ramp = pow(clamp(1.0 - smoothstep(0.0, 1.28, distance(uv, lightPos)), 0.0, 1.0), 1.15);

  float d = clamp(ramp * 0.78 + w * 0.30 - 0.08, 0.0, 1.0);
  float fine = fbm(p * 3.2 + 2.0 * s) * 0.5 + 0.5;
  d = pow(clamp(d + (fine - 0.5) * 0.10, 0.0, 1.0), 1.10);

  float L = mix(0.42, 0.99, d);
  float C = mix(0.11, 0.21, smoothstep(0.0, 0.72, d)) * (1.0 - 0.45 * smoothstep(0.80, 1.0, d)) * u_chroma;
  float hue = u_hue + (q.x + s.y) * 7.0;

  vec3 col = toSRGB(oklch2linear(L, C, hue));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface GradientFieldProps {
  /** Hue in degrees. 122 lime, 196 cyan, 250 azure, 292 violet, 28 ember, 338 magenta. */
  hue?: number;
  /** Chroma multiplier, 0 to 1.2. */
  chroma?: number;
  /** Animate. Off by default: a page of moving fields is noise, and it costs a frame budget. */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function GradientField({
  hue = 250,
  chroma = 0.95,
  animate = false,
  className,
  style,
}: GradientFieldProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: false, alpha: false });
    // 🔴 A MISSING CONTEXT IS NOT AN ERROR. Headless captures, old machines and locked-down
    // browsers all return null here; the caller's CSS background stays visible instead.
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // One oversized triangle rather than two: fewer vertices, no diagonal seam.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uT = gl.getUniformLocation(prog, "u_t");
    gl.uniform1f(gl.getUniformLocation(prog, "u_hue"), hue);
    gl.uniform1f(gl.getUniformLocation(prog, "u_chroma"), chroma);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, (r.width * dpr) | 0);
      cv.height = Math.max(1, (r.height * dpr) | 0);
      gl.viewport(0, 0, cv.width, cv.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const moving = animate && !reduced;

    let raf = 0;
    const draw = (t: number) => {
      gl.uniform2f(uRes, cv.width, cv.height);
      gl.uniform1f(uT, moving ? t * 0.00012 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (moving) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // A still field still needs one redraw per resize, or it stretches.
    const redraw = () => {
      if (!moving) {
        size();
        gl.uniform2f(uRes, cv.width, cv.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
    const ro2 = new ResizeObserver(redraw);
    ro2.observe(cv);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ro2.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [hue, chroma, animate]);

  return <canvas ref={ref} className={className} style={{ display: "block", ...style }} aria-hidden="true" />;
}
