"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// Ported verbatim from the design's Three.js scene. The vertex shader displaces each
// vertex along its normal by 3D simplex noise (Ashima/Gustavson `snoise`); the fragment
// shader shades the acid-green wireframe with a cursor-driven point light + fresnel rim.
const VERTEX_SHADER = `
  uniform float time;
  varying vec3 vNormal;
  varying vec3 vPosition;
  vec3 mod289v(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289v(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289v(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289v(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 xv=x_*ns.x+ns.yyyy;vec4 yv=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(xv)-abs(yv);
    vec4 b0=vec4(xv.xy,yv.xy);vec4 b1=vec4(xv.zw,yv.zw);
    vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  void main(){
    vNormal=normal;vPosition=position;
    float d=snoise(position*2.0+time*0.5)*0.2;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*d,1.0);
  }`;

const FRAGMENT_SHADER = `
  uniform vec3 color;
  uniform vec3 pointLightPos;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main(){
    vec3 n=normalize(vNormal);
    vec3 ld=normalize(pointLightPos-vPosition);
    float diff=max(dot(n,ld),0.0);
    float fresnel=pow(1.0-dot(n,vec3(0.0,0.0,1.0)),2.0);
    gl_FragColor=vec4(color*diff+color*fresnel*0.5,1.0);
  }`;

/**
 * The hero's animated acid-green wireframe icosahedron. Fills `#hero-3d` (absolute,
 * inset:0) behind the hero overlay + copy. Lazy-loaded via `next/dynamic` with
 * `ssr:false` from <Hero>, so `three` never enters the SSR/initial bundle.
 *
 * Lifecycle is hardened for React's dev double-invoke and route churn: a single
 * rAF loop, paused while the tab is hidden, and a cleanup that cancels the loop,
 * removes every listener, disposes the geometry/material/renderer, drops the GPU
 * context, and removes the canvas node — so two scenes can never stack or leak.
 * Respects `prefers-reduced-motion` by drawing one static frame instead of animating.
 */
export function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Old/headless browsers may lack WebGL; bail gracefully — the hero background +
    // overlay still render and the copy stays readable without the canvas.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 3;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1.2, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pointLightPos: { value: new THREE.Vector3(0, 0, 5) },
        color: { value: new THREE.Color(0xbcff3c) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      wireframe: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(0, 0, 5);
    scene.add(pointLight);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId = 0;
    const animate = (t: number) => {
      material.uniforms.time.value = t * 0.0003;
      mesh.rotation.y += 0.0005;
      mesh.rotation.x += 0.0002;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    const start = () => {
      if (!rafId) rafId = requestAnimationFrame(animate);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    if (reduceMotion) {
      renderer.render(scene, camera); // one static frame, no animation
    } else {
      start();
    }

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (reduceMotion) renderer.render(scene, camera);
    };
    window.addEventListener("resize", onResize, { passive: true });

    const onMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const dist = -camera.position.z / dir.z;
      const pos = camera.position.clone().add(dir.multiplyScalar(dist));
      pointLight.position.copy(pos);
      material.uniforms.pointLightPos.value = pos;
    };
    if (!reduceMotion) window.addEventListener("mousemove", onMouseMove, { passive: true });

    const onVisibility = () => {
      if (reduceMotion) return;
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div id="hero-3d" ref={mountRef} aria-hidden="true" />;
}
