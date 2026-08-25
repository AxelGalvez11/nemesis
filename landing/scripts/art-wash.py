"""Smooth gradient grounds for the landing page.

Owner, 2026-08-25: "integrate some smooth gradients (not the grainy ones)".
Every other file in public/nemesis/art is a generated render and carries the
generator's speckle. These two are computed: a white base with soft radial
blobs composited over it, so there is no grain anywhere in them by construction.

Palette is sampled from hero.webp so the new grounds are the same family of blue.
"""
import struct, sys

DEEP   = (0x06, 0x2E, 0x86)
COBALT = (0x0B, 0x60, 0xB4)
AZURE  = (0x2A, 0x8C, 0xCD)
PALE   = (0xCF, 0xE2, 0xF7)
MIST   = (0xDC, 0xEA, 0xF9)


def smoothstep(t):
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    return t * t * (3.0 - 2.0 * t)


def render(w, h, blobs, path):
    """blobs: (cx, cy, rx, ry, colour, peak) in normalised coords."""
    buf = bytearray(w * h * 3)
    for j in range(h):
        v = (j + 0.5) / h
        row = j * w * 3
        for i in range(w):
            u = (i + 0.5) / w
            r = g = b = 255.0
            for cx, cy, rx, ry, (cr, cg, cb), peak in blobs:
                du = (u - cx) / rx
                dv = (v - cy) / ry
                d = (du * du + dv * dv) ** 0.5
                a = smoothstep(1.0 - d) * peak
                if a <= 0.0:
                    continue
                r += (cr - r) * a
                g += (cg - g) * a
                b += (cb - b) * a
            k = row + i * 3
            buf[k] = int(r + 0.5)
            buf[k + 1] = int(g + 0.5)
            buf[k + 2] = int(b + 0.5)
    with open(path, "wb") as fh:
        fh.write(b"P6\n%d %d\n255\n" % (w, h))
        fh.write(bytes(buf))
    print("wrote", path, w, "x", h)


# ── "Visualize anything" ──────────────────────────────────────────────────────
# The band's mask is an ellipse off the RIGHT edge, so only the right third of this
# square is ever on screen. That is where the composition goes: a lit cobalt field
# with a pale core above it, deepening into the bottom corner.
SEE = [
    (1.02, 0.52, 0.78, 0.95, COBALT, 1.00),
    (1.12, 0.92, 0.55, 0.62, DEEP,   0.90),
    (1.05, 0.06, 0.45, 0.40, AZURE,  0.70),
    (0.80, 0.34, 0.34, 0.30, MIST,   0.85),
]

# ── "Built on evidence" ──────────────────────────────────────────────────────
# Same edge as `see`, deliberately NOT the same picture: the deep end is at the TOP
# here and the pale core sits low, so the two read as siblings rather than as one
# file used twice. This band's wash crossed sides to get away from the engraving,
# which put it on show — and the render it replaced was horizontal strata, so what
# arrived at the rim was a set of pale blue streaks.
EVIDENCE = [
    (1.02, 0.46, 0.72, 0.90, COBALT, 1.00),
    (1.10, 0.06, 0.52, 0.58, DEEP,   0.88),
    (1.04, 0.96, 0.44, 0.42, AZURE,  0.70),
    (0.82, 0.66, 0.32, 0.30, MIST,   0.82),
]

# ── "Accelerate cognition" ────────────────────────────────────────────────────
# Centred section, so the light is symmetric and low: it rises from the bottom
# edge and reaches both side edges, and is gone before the headline.
CLOSE = [
    (0.50, 1.10, 0.95, 0.66, COBALT, 1.00),
    (0.50, 1.30, 0.70, 0.50, DEEP,   0.85),
    (0.06, 1.06, 0.40, 0.52, AZURE,  0.65),
    (0.94, 1.06, 0.40, 0.52, AZURE,  0.65),
    (0.50, 0.86, 0.62, 0.34, PALE,   0.55),
]

out = sys.argv[1]
render(550, 550, SEE, out + "/see-wash.ppm")
render(550, 550, EVIDENCE, out + "/evidence-wash.ppm")
render(1000, 550, CLOSE, out + "/close-wash.ppm")

# Encode (from this directory, writing into public/nemesis/art):
#   python3 art-wash.py .
#   magick see-wash.ppm      -resize 1100x1100! -define webp:method=6 -quality 92 see-wash.webp
#   magick evidence-wash.ppm -resize 1100x1100! -define webp:method=6 -quality 92 evidence-wash.webp
#   magick close-wash.ppm -resize 2000x1100! -define webp:method=6 -quality 92 close-wash.webp
#   magick see-wash.webp      -resize 40x40 -quality 40 see-wash-blur.webp
#   magick evidence-wash.webp -resize 40x40 -quality 40 evidence-wash-blur.webp
#   magick close-wash.webp -resize 40x22 -quality 40 close-wash-blur.webp
# then base64 the two -blur files into components/home/art-blur.ts.
