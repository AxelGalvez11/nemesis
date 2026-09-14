// Helpers shared by the showcase compositions. Pure functions of their inputs: nothing here reads
// a clock or a random number, so every frame HyperFrames seeks renders the same pixels.
window.KIT = (() => {
  const TONE = { violet: "#8A63F0", azure: "#2A8CCD", emerald: "#17B87A", ink: "#0E1116", you: "#111110", orange: "#FF6A1A" };

  // The character's body: the squircle from lib/bloub/skins.ts (superellipse n = 4.2), 41 wide by
  // 36 tall, eyes stood upright. Never spun, never 3D (owner rules for the character).
  function squircle(cx, cy, a, b, n = 4.2, steps = 96) {
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
    }
    return d + "Z";
  }
  const mascot = (w) =>
    `<svg class="mascot" viewBox="0 0 41 36" width="${w}" height="${(w * 36) / 41}" aria-hidden="true">` +
    `<path d="${squircle(20.5, 18, 20.5, 18)}" fill="${TONE.ink}"/>` +
    `<rect class="eye" x="13.2" y="10" width="4.4" height="11" rx="2.2" fill="#F9F9F9"/>` +
    `<rect class="eye" x="23.4" y="10" width="4.4" height="11" rx="2.2" fill="#F9F9F9"/></svg>`;

  const pointer = `<svg viewBox="0 0 20 24"><path d="M2 1.5 L17 13 L10 13.8 L13.8 21.6 L11 22.9 L7.2 15 L2 20 Z" fill="currentColor" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const tick = `<svg viewBox="0 0 16 16"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /** Stage-space rectangle of an element, undoing the stage's own scale. */
  function rect(el, stage, k) {
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const x = (r.left - s.left) / k, y = (r.top - s.top) / k, w = r.width / k, h = r.height / k;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  /** Wraps each character of `el` in a span, so typing is revealed letter by letter at fixed layout. */
  function chars(el) {
    const text = el.textContent;
    el.textContent = "";
    return [...text].map((ch) => {
      const s = document.createElement("span");
      s.textContent = ch;
      el.appendChild(s);
      return s;
    });
  }

  function move(tl, cursor, x, y, at, dur = 0.9, ease = "power2.inOut") {
    tl.to(cursor, { x, y, duration: dur, ease }, at);
  }
  function click(tl, cursor, at) {
    const svg = cursor.querySelector("svg");
    tl.to(svg, { scale: 0.8, duration: 0.09, ease: "power2.out", transformOrigin: "12% 8%" }, at);
    tl.to(svg, { scale: 1, duration: 0.24, ease: "power2.out" }, at + 0.09);
  }
  /** Reveals `spans` one per 1/cps seconds, moving `caret` (optional) to the end of each. */
  function type(tl, spans, at, cps, caret, stage, k) {
    spans.forEach((s, i) => {
      const t = at + i / cps;
      tl.set(s, { opacity: 1 }, t);
      if (caret) {
        const r = rect(s, stage, k);
        const origin = rect(caret.offsetParent, stage, k).x + caret.offsetLeft;
        tl.set(caret, { x: r.x + r.w - origin + 1 }, t);
      }
    });
    return at + spans.length / cps;
  }
  return { TONE, squircle, mascot, pointer, tick, rect, chars, move, click, type };
})();
