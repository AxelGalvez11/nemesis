/**
 * GLSL noise for the particle lab.
 *
 * `SIMPLEX_3D` is vendored VERBATIM from Ashima Arts / stegu `webgl-noise`
 * (https://github.com/stegu/webgl-noise, https://github.com/ashima/webgl-noise),
 * MIT licensed, with its copyright header preserved as the licence requires.
 * It is the de-facto standard GLSL simplex noise and there is no reason to
 * hand-roll one — this is the single piece of third-party code in the lab.
 *
 * `FBM_3D` and `CURL_3D` below are ours: ~25 lines that compose `snoise` into
 * the two fields every candidate actually needs (fractal displacement, and a
 * divergence-free flow field). They are deliberately small — the alternative
 * was importing a particle framework to get them.
 */

/**
 * MIT. Copyright (C) 2011 Ashima Arts. Do not edit the body — it is upstream
 * source, and a local "improvement" here would silently desync every candidate.
 */
export const SIMPLEX_3D = /* glsl */ `
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
  }
`;

/**
 * Fractal Brownian motion — `octaves` layers of snoise at doubling frequency and
 * halving amplitude. Four octaves is the ceiling any candidate uses; the loop is
 * bounded by a constant so the shader compiles on every driver (a `uniform`-bound
 * loop is legal GLSL ES 3.0 but still miscompiles on some mobile drivers).
 *
 * Normalised to roughly [-1, 1] by dividing through the amplitude sum.
 */
export const FBM_3D = /* glsl */ `
float fbm3(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0;
  float amp = 1.0;
  float norm = 0.0;
  vec3 q = p;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    sum += amp * snoise(q);
    norm += amp;
    q *= lacunarity;
    amp *= gain;
  }
  return sum / max(norm, 1e-4);
}
`;

/**
 * Curl of a 3-component noise potential, by forward differences.
 *
 * The curl of any vector field is divergence-free, so points displaced along it
 * swirl into coherent filaments instead of clumping or spraying — which is why
 * candidate H reads as "reorganising" rather than "exploding". Bridson et al.,
 * "Curl-Noise for Procedural Fluid Flow" (SIGGRAPH 2007) is the source of the
 * idea; this is a plain re-implementation of it, not vendored code.
 *
 * Cost: 4 potential evaluations x 3 snoise = 12 snoise per point per frame. That
 * is by far the most expensive candidate in the lab and the metrics say so.
 */
export const CURL_3D = /* glsl */ `
vec3 curlPotential(vec3 p) {
  return vec3(
    snoise(p),
    snoise(p + vec3(31.416, 17.234, 9.876)),
    snoise(p + vec3(-7.129, 23.913, 41.317))
  );
}

vec3 curl3(vec3 p, float eps) {
  vec3 c = curlPotential(p);
  vec3 dx = (curlPotential(p + vec3(eps, 0.0, 0.0)) - c) / eps;
  vec3 dy = (curlPotential(p + vec3(0.0, eps, 0.0)) - c) / eps;
  vec3 dz = (curlPotential(p + vec3(0.0, 0.0, eps)) - c) / eps;
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x);
}
`;
