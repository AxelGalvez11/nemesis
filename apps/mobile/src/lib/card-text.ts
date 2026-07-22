// Flashcard text arrives as "markdown-ish": mostly markdown, but Anki-imported
// cards keep a few bare HTML tags that the web importer deliberately leaves in
// place (apps/web/lib/workspace/anki-text.ts writes <sub>/<sup>/<u> through
// untouched, and older rows can still carry <img>/<br>/<div>). Web renders
// those because its markdown pipeline preprocesses them; the phone's
// react-native-markdown-display is built with markdown-it's `html` option off,
// so anything still in tag form reaches the screen as literal text — which is
// how a card ends up showing a raw image URL instead of the picture.
//
// This normalizes that residue into things the phone renderer DOES understand,
// and is deliberately conservative: only the tags Anki actually leaves behind.
// Everything else, including all real markdown, passes through untouched.

/** Digits and the handful of symbols Unicode gives real sub/superscripts for.
 *  A run converts only when EVERY character maps — a partial conversion would
 *  silently drop the rest of the expression. */
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ",
  o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ",
  k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ",
  u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&apos;": "'",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

function toScript(inner: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of inner) {
    const mapped = table[ch.toLowerCase()];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/** Rewrite <sub>/<sup> runs as real Unicode where every character maps, and
 *  otherwise just drop the tags — a chemistry card should read "H₂O", never
 *  "H<sub>2</sub>O", and never lose the 2 either. */
function scriptTags(text: string, tag: "sub" | "sup"): string {
  const table = tag === "sub" ? SUBSCRIPT : SUPERSCRIPT;
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  return text.replace(pattern, (_match, inner: string) => toScript(inner, table) ?? inner);
}

/** Pull the src out of an <img> tag, single or double quoted. */
function imgSrc(tag: string): string | null {
  const match = /\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
  if (!match) return null;
  const url = match[2] ?? match[3] ?? "";
  return url.trim() ? url.trim() : null;
}

/**
 * Normalize one flashcard field for the phone renderer. Pure and idempotent —
 * running it twice changes nothing, since every rule replaces HTML with
 * non-HTML.
 */
export function normalizeCardText(raw: string): string {
  if (!raw || raw.indexOf("<") === -1) {
    // No tags at all: still decode entities, which Anki emits on their own.
    return decodeEntities(raw ?? "");
  }

  let text = raw;
  // An <img> becomes a real markdown image, so the picture renders instead of
  // the URL being read out as words.
  text = text.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = imgSrc(tag);
    return src ? `![](${src})` : "";
  });
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(div|p)>/gi, "\n");
  text = text.replace(/<(div|p)\b[^>]*>/gi, "");
  text = scriptTags(text, "sub");
  text = scriptTags(text, "sup");
  // Underline has no markdown equivalent the phone can draw; keep the words.
  text = text.replace(/<\/?u>/gi, "");
  text = text.replace(/<\/?(b|strong)>/gi, "**");
  text = text.replace(/<\/?(i|em)>/gi, "*");
  return decodeEntities(text);
}

function decodeEntities(text: string): string {
  if (text.indexOf("&") === -1) return text;
  return text.replace(/&(amp|apos|gt|lt|nbsp|quot|#39);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}
