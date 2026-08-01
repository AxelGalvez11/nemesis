// Build the extension's toolbar icons from the Nemesis app mark.
//
// Run: node extension/make-icons.mjs
//
// WHY THIS EXISTS AS A SCRIPT and not four PNGs someone once exported: when the
// mark changes, the four sizes have to change together. A checked-in set with
// no recipe drifts the first time anyone touches the brand.
//
// WHY THE CONTAINER VERSION. The bare wing mark is black on transparent, which
// is invisible against Chrome's dark toolbar. The app icon carries its own
// black background, so it reads on a light toolbar and a dark one without
// needing two sets.
//
// 🔴 THE SOURCE HAS A WIDE TRANSPARENT MARGIN — about 9% on every side, meant
// for macOS, which draws app icons inset. Chrome does not: it scales what you
// give it into a 16px box. Shipping the source unchanged wastes a fifth of the
// width on nothing and turns the wings into a smudge, so the margin is cropped
// off first and the rounded square fills the frame.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const SOURCE = join(repo, "apps/nemesis-desktop/assets/nemesis-icon-1024.png");
const OUT = join(here, "icons");

/**
 * Chrome asks for these four. 16 is the toolbar, 128 is the install dialog and
 * the Web Store listing; the middle two are Windows and the manager.
 *
 * 🔴 THE SMALL ONES ARE THICKENED FIRST. The mark is three thin strokes per
 * wing. Shrinking 824px to 16 puts roughly fifty source pixels into each output
 * pixel, so the white strokes average with the black behind them and the whole
 * thing arrives as grey mush — checked by eye at 10x, not assumed. Widening the
 * strokes BEFORE the shrink keeps them white. 48 and up have room for the real
 * detail and get none of this.
 *
 * `dilate` is a MaxFilter radius in SOURCE pixels, tuned by looking at all five
 * candidates side by side: below this the strokes stay dim, above it the two
 * wings merge into a blob.
 */
const SIZES = [
  { dilate: 25, size: 16 },
  { dilate: 13, size: 32 },
  { dilate: 0, size: 48 },
  { dilate: 0, size: 128 },
];

mkdirSync(OUT, { recursive: true });

// Pillow rather than sips: sips cannot crop to an alpha bounding box, and that
// crop is the whole point of this script.
const script = `
import sys
from PIL import Image, ImageFilter

src = Image.open(${JSON.stringify(SOURCE)}).convert("RGBA")
box = src.getbbox()          # tightest rectangle holding a non-transparent pixel
if box is None:
    sys.exit("source image is fully transparent")
mark = src.crop(box)
print("cropped", src.size, "->", mark.size)

for spec in ${JSON.stringify(SIZES)}:
    size, dilate = spec["size"], spec["dilate"]
    art = mark
    if dilate:
        # MaxFilter spreads BRIGHT pixels, which is exactly "make the white
        # wings fatter". Alpha is left alone so the rounded corners survive.
        r, g, b, a = art.split()
        f = ImageFilter.MaxFilter(dilate)
        art = Image.merge("RGBA", (r.filter(f), g.filter(f), b.filter(f), a))
    # LANCZOS: a cheaper filter turns thin diagonals to mush.
    out = art.resize((size, size), Image.LANCZOS)
    path = ${JSON.stringify(OUT)} + "/icon-%d.png" % size
    out.save(path, "PNG", optimize=True)
    print("wrote", path, "dilate", dilate)
`;

const tmp = join(here, ".make-icons.py");
writeFileSync(tmp, script);
try {
  process.stdout.write(execFileSync("python3", [tmp], { encoding: "utf8" }));
} finally {
  execFileSync("rm", ["-f", tmp]);
}
