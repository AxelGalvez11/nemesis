"use client";

// A molecule or a reaction, turned into bytes a slide can carry.
//
// 🔴🔴 A .pptx CANNOT REFERENCE ANYTHING OUTSIDE ITSELF, so the drawing has to become a picture
// before the deck is built — the same bargain `deck-pptx.ts` already makes with textures and with
// the learner's own figures. `smiles-drawer` writes SVG into a DOM element, so this runs in the
// browser at build time and hands back a PNG data URI.
//
// 🔴 THE PLAN STORES THE NOTATION, NOT THE PICTURE. A drawn molecule is a deterministic function of
// its SMILES, so nothing here is persisted: baking base64 PNGs into a saved plan would put tens of
// kilobytes per slide into a canvas record that loads on every visit, and would freeze the drawing
// against a library that improves.

/** The drawing's pixel size before the device ratio. Wide enough for a four-part reaction. */
const WIDTH = 900;
const HEIGHT = 520;

/**
 * 🔴🔴 A CONCRETE FAMILY, NEVER `var(--font)`, AND THIS IS THE TRAP THAT COSTS THE WHOLE PICTURE.
 * `chemical-structure.tsx` passes a CSS variable because it draws INTO the page, where the variable
 * resolves. A serialised SVG loaded through `new Image()` is its own document with no stylesheet and
 * no custom properties: `var(--font)` resolves to nothing, the `font` shorthand it sits inside is
 * voided entirely, and every atom label renders at a browser default the layout was not computed
 * for — or not at all. Only fonts named literally, and present on the machine, survive the trip.
 */
const EXPORT_FONT = "Helvetica, Arial, sans-serif";

/** Draws once into a detached SVG and returns the serialised markup. */
async function structureSvg(notation: "reaction-smiles" | "smiles", value: string): Promise<string | null> {
  const library = (await import("smiles-drawer")).default;

  // 🔴 ATTACHED, BUT OFF SCREEN. The drawer measures text while it lays a molecule out, and a
  // detached element measures zero — which produces a drawing with every label stacked at the
  // origin. Absolute and far off-canvas costs one reflow and gets real metrics.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(WIDTH));
  svg.setAttribute("height", String(HEIGHT));
  host.append(svg);
  document.body.append(host);

  try {
    const options = { fontFamily: EXPORT_FONT, height: HEIGHT, padding: 16, width: WIDTH };
    if (notation === "reaction-smiles") {
      const reaction = library.ReactionParser.parse(value);
      new library.ReactionDrawer({}, { ...options, width: Math.round(WIDTH / 2.4) }).draw(
        reaction,
        svg,
        "light",
        null,
        "",
        "",
      );
    } else {
      const drawer = new library.SvgDrawer(options);
      drawer.draw(library.Parser.parse(value), svg, "light", null, false, []);
    }
    // The drawer sets its own viewBox; the attributes above are what the raster is sized from.
    svg.setAttribute("width", String(WIDTH));
    svg.setAttribute("height", String(HEIGHT));
    return new XMLSerializer().serializeToString(svg);
  } catch {
    // A notation the parser refuses is a picture we do not draw. The caller keeps the slide.
    return null;
  } finally {
    host.remove();
  }
}

/**
 * A PNG data URI for one structure, or null when it could not be drawn.
 *
 * 🔴 NULL RATHER THAN A THROW. Every caller is assembling a deck, and a molecule that will not draw
 * must cost its own frame and nothing else — the same policy `figurePlate` follows for a figure
 * whose signature expired.
 */
export async function structurePng(
  notation: "reaction-smiles" | "smiles",
  value: string,
  scale = 2,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const markup = await structureSvg(notation, value);
  if (!markup) return null;

  // 🔴 A `data:` URL, NOT `URL.createObjectURL`. A blob URL for an SVG is a different origin as far
  // as the canvas is concerned in some engines, which taints it and makes `toDataURL` throw a
  // security error — a failure that appears only in the browsers you did not test.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const image = new Image();
  const drawn = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = source;
  });
  if (!drawn) return null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // 🔴 PAINTED WHITE FIRST. A PNG with a transparent ground looks right on the deck's own paper and
  // wrong the moment somebody drops the slide on a dark background in PowerPoint — and the bonds
  // are black, so transparent-on-dark is an invisible molecule.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
