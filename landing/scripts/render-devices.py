"""Render a screenshot into a MacBook or iPhone frame that reads as hardware.

The landing page's CSS-drawn outlines read as diagrams, not machines. This
composites the real capture into a rendered body: aluminium gradient, a lighter
machined edge, black glass bezel, a notch/island, and a contact shadow.

Everything is greyscale, because the page is black and white — aluminium happens
to be grey, so realism and the palette do not fight. Two tones are produced per
device: a space-black body for the white page and a silver body for the black
one, chosen by <picture> media at runtime.

Rendered at SS x scale and downsampled, which is what keeps the corner radii and
the one-pixel edge highlight clean.
"""
from __future__ import annotations

import sys
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SS = 3  # supersample factor


# ── tones ────────────────────────────────────────────────────────────────────
# (body_top, body_bottom, edge_highlight, bezel, base_top, base_bottom)
TONES = {
    # Space black on a white page.
    "light": dict(body=((58, 58, 62), (28, 28, 32)), edge=(126, 126, 134),
                  bezel=(8, 8, 10), base=((72, 72, 78), (26, 26, 30)),
                  groove=(14, 14, 16), shadow=90),
    # Silver on a black page. The body has to out-light the ground or the
    # device dissolves into the page.
    "dark": dict(body=((208, 208, 216), (150, 150, 160), ), edge=(246, 246, 250),
                 bezel=(16, 16, 18), base=((214, 214, 222), (132, 132, 142)),
                 groove=(96, 96, 104), shadow=0),
}


def vgrad(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """A vertical linear gradient — the whole reason a flat fill looks like paper."""
    w, h = size
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    arr = np.zeros((h, w, 3), dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = top[c] + (bottom[c] - top[c]) * t
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def panel(size, radius, top, bottom, edge=None, edge_w=0):
    """A rounded metal panel: gradient body, optional lighter machined rim."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    body = vgrad(size, top, bottom).convert("RGBA")
    mask = rounded_mask(size, radius)
    if edge is not None and edge_w > 0:
        rim = Image.new("RGBA", size, (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle(
            [0, 0, size[0] - 1, size[1] - 1], radius=radius, outline=(*edge, 255), width=edge_w
        )
        body = Image.alpha_composite(body, rim)
    img.paste(body, (0, 0), mask)
    return img


def contact_shadow(canvas_size, box, blur, alpha):
    """A soft shadow under the device. Skipped entirely on the dark tone —
    a black shadow on a black page is either invisible or a smudge."""
    if alpha <= 0:
        return Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    sh = Image.new("L", canvas_size, 0)
    ImageDraw.Draw(sh).rounded_rectangle(box, radius=blur, fill=alpha)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    out.putalpha(sh)
    return Image.merge("RGBA", (*[Image.new("L", canvas_size, 0)] * 3, sh))


def screen_glare(size, radius, strength=16):
    """A faint diagonal sheen across the glass. Subtle on purpose: the job is to
    stop the screen reading as a flat pasted rectangle, not to add drama."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = (xx / w) + (yy / h)
    band = np.clip(1.0 - np.abs(d - 0.55) * 2.6, 0, 1) ** 2
    a = (band * strength).astype(np.uint8)
    layer = Image.new("RGBA", size, (255, 255, 255, 0))
    layer.putalpha(Image.fromarray(a, "L"))
    layer = Image.merge("RGBA", (Image.new("L", size, 255), Image.new("L", size, 255),
                                 Image.new("L", size, 255), Image.fromarray(a, "L")))
    layer.putalpha(Image.composite(Image.fromarray(a, "L"), Image.new("L", size, 0),
                                   rounded_mask(size, radius)))
    return layer


# ── MacBook ──────────────────────────────────────────────────────────────────
def macbook(shot_path: str, tone: str, out_path: str, out_w: int = 2400) -> None:
    """A 14-inch MacBook Pro, straight on: lid, notch, and the tapered base."""
    t = TONES[tone]
    shot = Image.open(shot_path).convert("RGB")

    # Lid geometry as fractions of lid width, off the real machine: the display
    # is 16:10 and the bezel is thin and even, wider only under the screen.
    lid_w = int(out_w * 0.815) * SS
    bezel = max(2, int(lid_w * 0.0115))
    chin = int(bezel * 2.25)             # the lid's bottom lip, above the hinge
    scr_w = lid_w - bezel * 2
    scr_h = int(scr_w / 1.5397)          # 3024x1964
    lid_h = scr_h + bezel + chin
    lid_r = int(lid_w * 0.021)

    # The base: wider than the lid, and thick enough to read as the machine
    # rather than as a rule under it.
    base_w = int(lid_w * 1.093)
    base_h = int(lid_h * 0.042)
    foot_h = int(base_h * 0.42)

    W = int(out_w * SS)
    H = lid_h + base_h + foot_h + int(lid_h * 0.10)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    lid_x = (W - lid_w) // 2
    base_x = (W - base_w) // 2

    # Shadow first, hugging the base rather than the lid — that is where the
    # machine actually touches the desk.
    canvas.alpha_composite(contact_shadow(
        (W, H), [base_x + int(base_w * 0.02), lid_h + base_h - int(base_h * 0.2),
                 base_x + base_w - int(base_w * 0.02), lid_h + base_h + foot_h + int(base_h * 0.9)],
        blur=int(base_h * 1.5), alpha=t["shadow"]))

    # Lid. Its BOTTOM corners are then squared off: a lid rounded on all four
    # corners leaves two white wedges where it meets the base, and the machine
    # reads as two parts that happen to be near each other.
    lid = panel((lid_w, lid_h), lid_r, *t["body"], edge=t["edge"], edge_w=max(1, SS))
    square = panel((lid_w, lid_r * 2), 0, t["body"][1], t["body"][1],
                   edge=t["edge"], edge_w=max(1, SS))
    lid.alpha_composite(square.crop((0, 0, lid_w, lid_r)), (0, lid_h - lid_r))
    canvas.alpha_composite(lid, (lid_x, 0))
    # Black glass under the screenshot, so the bezel is glass and not paint.
    glass = panel((lid_w - bezel, lid_h - bezel), int(lid_r * 0.8), t["bezel"], t["bezel"])
    canvas.alpha_composite(glass, (lid_x + bezel // 2, bezel // 2))

    # The capture, extended upward with its own top-edge colour. A browser
    # viewport has no menu bar, so without this strip the notch lands on the tab
    # row and eats a tab. With it, the notch sits in empty chrome, which is what
    # a full-screen Mac app actually looks like.
    px = np.asarray(shot)
    top_rgb = tuple(int(v) for v in np.median(px[0:2, :, :].reshape(-1, 3), axis=0))
    pad_src = int(shot.height * 0.030)
    padded = Image.new("RGB", (shot.width, shot.height + pad_src), top_rgb)
    padded.paste(shot, (0, pad_src))

    scr = padded.resize((scr_w, scr_h), Image.LANCZOS).convert("RGBA")
    scr.putalpha(rounded_mask((scr_w, scr_h), int(lid_r * 0.45)))
    canvas.alpha_composite(scr, (lid_x + bezel, bezel))
    canvas.alpha_composite(screen_glare((scr_w, scr_h), int(lid_r * 0.45)), (lid_x + bezel, bezel))

    # The notch. It has to CUT INTO the screenshot to be recognisable — drawn
    # only as deep as the bezel it is flush with, it is a shade change on black
    # and nobody sees it. Bottom corners rounded, top corners run off the top.
    n_w = int(scr_w * 0.152)
    n_h = bezel + int(bezel * 1.05)
    nx = lid_x + (lid_w - n_w) // 2
    notch = Image.new("RGBA", (n_w, n_h), (0, 0, 0, 0))
    nr = int(bezel * 0.55)
    ImageDraw.Draw(notch).rounded_rectangle([0, -nr * 2, n_w - 1, n_h - 1],
                                            radius=nr, fill=(*t["bezel"], 255))
    canvas.alpha_composite(notch, (nx, 0))

    # Base slab, then the front foot it tapers into.
    canvas.alpha_composite(panel((base_w, base_h), int(base_h * 0.16), *t["base"],
                                 edge=t["edge"], edge_w=max(1, SS // 2)), (base_x, lid_h))
    foot_w = int(base_w * 0.985)
    canvas.alpha_composite(
        panel((foot_w, foot_h * 2), foot_h, t["base"][1], t["base"][1]),
        ((W - foot_w) // 2, lid_h + base_h - foot_h))

    # Finger groove.
    g_w, g_h = int(base_w * 0.11), int(base_h * 0.5)
    groove = Image.new("RGBA", (g_w, g_h * 2), (0, 0, 0, 0))
    ImageDraw.Draw(groove).rounded_rectangle([0, -g_h, g_w - 1, g_h - 1],
                                             radius=int(g_h * 0.6), fill=(*t["groove"], 255))
    canvas.alpha_composite(groove, ((W - g_w) // 2, lid_h))

    canvas.resize((out_w, H // SS), Image.LANCZOS).save(out_path, quality=88, method=6)
    print(f"{out_path}  {out_w}x{H // SS}")


# ── iPhone ───────────────────────────────────────────────────────────────────
def iphone(shot_path: str, tone: str, out_path: str, out_w: int = 760) -> None:
    """An iPhone Pro, straight on: titanium band, uniform bezel, island.

    The capture is a real 390x844 browser viewport, which has no status bar, so
    a strip of the app's own top-edge colour is extended upward and the island
    sits on that. Without it the island lands on the first line of content and
    reads as a redaction bar.
    """
    t = TONES[tone]
    shot = Image.open(shot_path).convert("RGB")

    body_w = int(out_w * 0.985) * SS
    band = max(2, int(body_w * 0.026))       # the metal rim
    bezel = max(2, int(body_w * 0.021))      # black glass between rim and pixels
    scr_w = body_w - (band + bezel) * 2
    scr_h = int(scr_w * (2556 / 1179))       # 6.1-inch Pro
    body_h = scr_h + (band + bezel) * 2
    body_r = int(body_w * 0.157)
    scr_r = int(body_r * 0.80)

    W, H = int(out_w * SS), body_h + int(body_h * 0.045)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bx = (W - body_w) // 2

    canvas.alpha_composite(contact_shadow(
        (W, H), [bx + int(body_w * 0.06), body_h - int(body_h * 0.02),
                 bx + body_w - int(body_w * 0.06), body_h + int(body_h * 0.035)],
        blur=int(body_w * 0.05), alpha=t["shadow"]))

    # Titanium body with its machined rim, then the glass it holds.
    canvas.alpha_composite(panel((body_w, body_h), body_r, *t["body"],
                                 edge=t["edge"], edge_w=max(1, SS)), (bx, 0))
    gw, gh = body_w - band * 2, body_h - band * 2
    canvas.alpha_composite(panel((gw, gh), int(body_r * 0.88), t["bezel"], t["bezel"]),
                           (bx + band, band))

    # Extend the capture upward with its own top-edge colour to stand in for the
    # status bar the browser viewport does not have.
    px = np.asarray(shot)
    top_rgb = tuple(int(v) for v in np.median(px[0:2, :, :].reshape(-1, 3), axis=0))
    status_h_src = int(shot.height * 0.052)
    padded = Image.new("RGB", (shot.width, shot.height + status_h_src), top_rgb)
    padded.paste(shot, (0, status_h_src))

    scr = padded.resize((scr_w, scr_h), Image.LANCZOS).convert("RGBA")
    scr.putalpha(rounded_mask((scr_w, scr_h), scr_r))
    sx, sy = bx + band + bezel, band + bezel
    canvas.alpha_composite(scr, (sx, sy))
    canvas.alpha_composite(screen_glare((scr_w, scr_h), scr_r, strength=13), (sx, sy))

    # Dynamic Island, sitting on the strip that was just added.
    i_w, i_h = int(scr_w * 0.312), int(scr_w * 0.092)
    island = Image.new("RGBA", (i_w, i_h), (0, 0, 0, 0))
    ImageDraw.Draw(island).rounded_rectangle([0, 0, i_w - 1, i_h - 1],
                                             radius=i_h // 2, fill=(0, 0, 0, 255))
    canvas.alpha_composite(island, (sx + (scr_w - i_w) // 2, sy + int(scr_h * 0.0135)))

    # Side buttons, drawn as slivers of the band on the outer edge.
    btn = t["edge"]
    d = ImageDraw.Draw(canvas)
    for y0, y1 in [(0.190, 0.245)]:                       # action / mute
        d.rounded_rectangle([bx - max(1, SS), int(body_h * y0), bx + band // 2, int(body_h * y1)],
                            radius=band // 3, fill=(*btn, 255))
    for y0, y1 in [(0.275, 0.352), (0.368, 0.445)]:       # volume
        d.rounded_rectangle([bx - max(1, SS), int(body_h * y0), bx + band // 2, int(body_h * y1)],
                            radius=band // 3, fill=(*btn, 255))
    d.rounded_rectangle([bx + body_w - band // 2, int(body_h * 0.300),
                         bx + body_w + max(1, SS), int(body_h * 0.412)],
                        radius=band // 3, fill=(*btn, 255))  # side button

    canvas.resize((out_w, H // SS), Image.LANCZOS).save(out_path, quality=88, method=6)
    print(f"{out_path}  {out_w}x{H // SS}")


if __name__ == "__main__":
    shots, out = sys.argv[1], sys.argv[2]
    for tone in ("light", "dark"):
        # WebP, not PNG. These carry alpha (the rounded body and its shadow) and
        # the laptop is the hero image, so it is the first thing downloaded — the
        # same frame is ~360 KB as PNG and under 100 KB here, at 2x for the
        # roughly 1000 and 200 CSS pixels each is actually displayed at.
        macbook(f"{shots}/mac-library-{tone}.png", tone, f"{out}/device-mac-{tone}.webp", out_w=2000)
        iphone(f"{shots}/phone-chat-{tone}.png", tone, f"{out}/device-phone-{tone}.webp", out_w=520)
