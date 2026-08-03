"""Composite the real app captures into Apple's official product bezels.

This script used to *draw* a laptop and a phone — aluminium gradients, a machined
edge, a hand-placed notch. Drawn metal reads as a diagram of a machine, never as a
machine, so the frames were replaced with the ones Apple publishes for exactly this
purpose (Apple Design Resources -> Product Bezels).

Those bezels are PNGs with the screen punched out to the display's native pixel
size — 3024x1964 for the 14-inch MacBook Pro, 1206x2622 for the iPhone 17 — so the
job here is only: scale the bezel to the delivery size, scale our capture to cover
the hole, and composite the bezel on top. The bezel's own opaque pixels then draw
the rounded screen corners and the notch over the capture for free.

Nothing is added to Apple's artwork. Apple's marketing guidelines require their
product images be used as-is: no reflections, highlights or shadows painted onto
the screen, no cropping, tilting or obstruction, and latest-generation devices
only. The old renderer's glare and contact shadow are gone for that reason; if the
page wants depth it belongs in CSS, outside the asset.

LICENSING. The bezel package is licensed, not ours. Mounting the disk image
accepts Apple's Design Resources License, so this script will not do that behind
your back — pass --accept-apple-license to say you accept it. The downloaded
package and the mounted volume are never committed: Apple's license forbids
redistributing the resources, so the repository holds only the finished
composites, which are the "Mock-Ups" the license exists to let you display.

Usage:
    python3 scripts/render-devices.py <shots-dir> <out-dir> --accept-apple-license
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

APPLE_CDN = "https://devimages-cdn.apple.com/design/resources/download"

# Which bezel each device uses, and which finish goes with each page ground.
# The palette is two-tone black and white, so the devices follow it: the dark
# finish on the white page, the light finish on the black one. Anything else and
# the machine either dissolves into the ground or shouts over it.
DEVICES = {
    "mac": {
        "dmg": "Bezel-MacBook-Pro-M5.dmg",
        "volume": "Bezel-MacBook-Pro-M5",
        "finish": {
            "light": "PNG/MacBook Pro M5 14-inch Space Black.png",
            "dark": "PNG/MacBook Pro M5 14-inch Silver.png",
        },
        "shot": "mac-library-{tone}.png",
        "out": "device-mac-{tone}.webp",
        # 2x the ~1000 CSS pixels the laptop is actually displayed at.
        "width": 2000,
        "clock": False,
    },
    "phone": {
        "dmg": "Bezel-iPhone-17.dmg",
        "volume": "Bezel-iPhone-17",
        "finish": {
            "light": "PNG/iPhone 17/iPhone 17 - Black - Portrait.png",
            "dark": "PNG/iPhone 17/iPhone 17 - White - Portrait.png",
        },
        "shot": "phone-chat-{tone}.png",
        "out": "device-phone-{tone}.webp",
        "width": 520,
        # A phone shows a clock; a laptop lid does not.
        "clock": True,
    },
}


def cache_dir() -> Path:
    """Where the downloaded packages live. Deliberately outside the repository."""
    d = Path(os.environ.get("NEMESIS_BEZEL_CACHE", Path.home() / "Library/Caches/nemesis-bezels"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def mounted_volume(name: str) -> Path | None:
    p = Path("/Volumes") / name
    return p if p.is_dir() else None


def ensure_volume(dmg: str, volume: str, accepted: bool) -> Path:
    """Return the mount point for a bezel package, downloading and mounting if needed.

    Mounting is what accepts Apple's license — the disk image will not attach
    without agreeing — so it happens only behind an explicit flag.
    """
    already = mounted_volume(volume)
    if already:
        return already

    if not accepted:
        raise SystemExit(
            f"'{volume}' is not mounted, and mounting it accepts Apple's Design Resources\n"
            f"License. Re-run with --accept-apple-license if you accept it."
        )

    local = cache_dir() / dmg
    if not local.exists():
        url = f"{APPLE_CDN}/{dmg}"
        print(f"downloading {dmg} …")
        tmp = local.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(local)

    print(f"mounting {dmg} …")
    # `yes` answers Apple's license prompt. The caller has already said they accept it.
    subprocess.run(
        f"yes | hdiutil attach -nobrowse -readonly -noverify {local!s:s}",
        shell=True, check=True, capture_output=True,
    )
    mount = mounted_volume(volume)
    if not mount:
        raise SystemExit(f"{dmg} mounted but /Volumes/{volume} is missing")
    return mount


def screen_hole(bezel: Image.Image) -> tuple[int, int, int, int]:
    """Find the punched-out screen in a bezel: (left, top, width, height).

    The transparent pixels are in two places — the surroundings and the screen —
    so labelling them and discarding whatever touches the border leaves the
    screen. Reading it from the artwork rather than hardcoding coordinates means
    a new device drops in without a table of magic numbers.
    """
    alpha = np.array(bezel.getchannel("A"))
    labels, count = ndimage.label(alpha < 8)
    if count == 0:
        raise SystemExit("bezel has no transparent pixels — wrong file?")

    outside = set(np.unique(np.concatenate(
        [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
    )))
    interior = [i for i in range(1, count + 1) if i not in outside]
    if not interior:
        raise SystemExit("bezel has no interior hole — wrong file?")

    # Largest interior hole is the display; anything smaller is a camera or port.
    best = max(interior, key=lambda i: int((labels == i).sum()))
    ys, xs = np.where(labels == best)
    return int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)


def top_intrusion(bezel: Image.Image, hole: tuple[int, int, int, int]) -> int:
    """How far Apple's artwork reaches down into the screen: the notch, or the island.

    Both are opaque pixels sitting inside the punched-out screen, and both will
    print straight over the capture unless something clears room for them. On the
    14-inch MacBook Pro the notch hangs 64px into a 1964px-tall display; on the
    iPhone 17 the Dynamic Island floats between 43px and 150px down.

    Blobs touching a side edge are the screen's own rounded corners, not hardware,
    so they are skipped — otherwise the corners would be mistaken for a notch and
    push the whole capture down for nothing.
    """
    x, y, w, h = hole
    inside = np.array(bezel.getchannel("A"))[y:y + h, x:x + w] > 128
    labels, count = ndimage.label(inside)

    reach = 0
    for i in range(1, count + 1):
        ys, xs = np.where(labels == i)
        if ys.min() > h * 0.25:                      # too far down to be a top feature
            continue
        if xs.min() == 0 or xs.max() == w - 1:       # a rounded corner
            continue
        reach = max(reach, int(ys.max()) + 1)
    return reach


def edge_colour(shot: Image.Image) -> tuple[int, int, int]:
    """The capture's own top-edge colour, for the strip the notch will sit in.

    Sampled rather than assumed: the strip has to read as more of the app's
    chrome, and the app is light or dark depending on which tone is rendering.
    """
    row = np.array(shot.convert("RGB"))[0]
    return tuple(int(v) for v in np.median(row, axis=0))


def fit_into(shot: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale a capture to fit entirely inside `size`, padding rather than cropping.

    Filling the screen and cropping the overflow was the obvious approach and it
    was wrong: making room for the Dynamic Island leaves the phone's usable area
    slightly squarer than the capture, and the ~6% that had to go came off either
    the chat header or the composer, both of which are the point of the shot.

    Padding costs nothing instead, because the app's own edges are flat colour —
    the fill is sampled from the capture's outermost row or column, so a strip of
    it is indistinguishable from a slightly wider margin. Each side is sampled
    separately, so a light sidebar against a white page still blends.
    """
    tw, th = size
    scale = min(tw / shot.width, th / shot.height)
    w, h = max(1, round(shot.width * scale)), max(1, round(shot.height * scale))
    resized = shot.resize((w, h), Image.LANCZOS)
    if (w, h) == (tw, th):
        return resized

    px = np.array(shot.convert("RGB"))
    def median(strip: np.ndarray) -> tuple[int, int, int]:
        return tuple(int(v) for v in np.median(strip, axis=0))

    canvas = Image.new("RGBA", size, (*median(px[:, 0]), 255))
    draw = ImageDraw.Draw(canvas)
    left, top = (tw - w) // 2, (th - h) // 2
    if w < tw:
        draw.rectangle([0, 0, left, th], fill=(*median(px[:, 0]), 255))
        draw.rectangle([left + w, 0, tw, th], fill=(*median(px[:, -1]), 255))
    if h < th:
        draw.rectangle([0, 0, tw, top], fill=(*median(px[0]), 255))
        draw.rectangle([0, top + h, tw, th], fill=(*median(px[-1]), 255))
    canvas.paste(resized, (left, top))
    return canvas


def status_bar(screen: Image.Image, band: int, ink: tuple[int, int, int]) -> None:
    """Clock and indicators either side of the Dynamic Island.

    A phone with a bare strip above the app looks switched on but not in use. The
    time is 9:41, which is the time in every Apple product photograph. Drawn on
    our own capture, never on Apple's artwork.
    """
    w = screen.width
    mid = band * 0.52
    size = max(9, round(band * 0.30))
    draw = ImageDraw.Draw(screen)

    font = None
    for candidate in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            font = ImageFont.truetype(candidate, size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    draw.text((w * 0.085, mid), "9:41", fill=(*ink, 255), font=font, anchor="lm")

    # Signal bars, wifi arcs and a battery, at the scale of the type beside them.
    unit = size * 0.20
    right = w * 0.915
    bat_w, bat_h = unit * 6.4, unit * 3.1
    x0 = right - bat_w
    draw.rounded_rectangle([x0, mid - bat_h / 2, right, mid + bat_h / 2],
                           radius=unit * 0.9, outline=(*ink, 130), width=max(1, round(unit * 0.42)))
    draw.rounded_rectangle([x0 + unit * 0.7, mid - bat_h / 2 + unit * 0.7,
                            right - unit * 0.9, mid + bat_h / 2 - unit * 0.7],
                           radius=unit * 0.35, fill=(*ink, 255))

    wifi_r = unit * 2.4
    cx = x0 - unit * 2.6
    for k in (1.0, 0.62, 0.26):
        r = wifi_r * k
        draw.arc([cx - r, mid - r + unit * 1.1, cx + r, mid + r + unit * 1.1],
                 start=218, end=322, fill=(*ink, 255), width=max(1, round(unit * 0.62)))

    bx = cx - wifi_r - unit * 2.4
    for k in range(4):
        bh = unit * (1.15 + 0.62 * k)
        left = bx + k * unit * 1.5
        draw.rounded_rectangle([left, mid + unit * 1.5 - bh, left + unit * 0.95, mid + unit * 1.5],
                               radius=unit * 0.3, fill=(*ink, 255))


def compose(shot_path: Path, bezel_path: Path, out_path: Path, out_w: int, clock: bool) -> None:
    bezel = Image.open(bezel_path).convert("RGBA")

    # Scale the bezel down to delivery size FIRST, then fit the capture to the
    # smaller hole. Compositing at Apple's native 3860px and downsampling after
    # would put the capture through a big upscale it never recovers from.
    out_h = round(bezel.height * out_w / bezel.width)
    bezel = bezel.resize((out_w, out_h), Image.LANCZOS)

    x, y, w, h = screen_hole(bezel)
    shot = Image.open(shot_path).convert("RGBA")

    # Clear the notch/island, plus a little breathing room, and fill that strip
    # with the capture's own top colour so the hardware sits in the app's chrome
    # rather than on top of a sentence.
    band = top_intrusion(bezel, (x, y, w, h))
    if band:
        band += round(h * 0.008)

    screen = Image.new("RGBA", (w, h), (*edge_colour(shot), 255))
    screen.paste(fit_into(shot, (w, h - band)), (0, band))
    if band and clock:
        lum = sum(edge_colour(shot)) / 3
        status_bar(screen, band, (18, 18, 20) if lum > 128 else (236, 236, 240))

    canvas = Image.new("RGBA", bezel.size, (0, 0, 0, 0))
    canvas.paste(screen, (x, y))
    canvas.alpha_composite(bezel)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, quality=88, method=6)
    kb = out_path.stat().st_size / 1024
    print(f"{out_path.name}  {out_w}x{out_h}  screen {w}x{h}  cleared {band}px  {kb:.0f} KB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("shots", type=Path, help="directory of source captures")
    ap.add_argument("out", type=Path, help="directory to write the framed devices to")
    ap.add_argument("--accept-apple-license", action="store_true",
                    help="you accept Apple's Design Resources License; required to mount the bezels")
    ap.add_argument("--keep-mounted", action="store_true",
                    help="leave the bezel volumes mounted instead of ejecting when done")
    args = ap.parse_args()

    if sys.platform != "darwin":
        raise SystemExit("Apple ships the bezels as .dmg — this needs macOS.")

    mounted: list[str] = []
    try:
        for spec in DEVICES.values():
            was_mounted = mounted_volume(spec["volume"]) is not None
            volume = ensure_volume(spec["dmg"], spec["volume"], args.accept_apple_license)
            if not was_mounted:
                mounted.append(str(volume))
            for tone in ("light", "dark"):
                compose(
                    args.shots / spec["shot"].format(tone=tone),
                    volume / spec["finish"][tone],
                    args.out / spec["out"].format(tone=tone),
                    spec["width"],
                    spec["clock"],
                )
    finally:
        if not args.keep_mounted:
            for volume in mounted:
                subprocess.run(["hdiutil", "detach", volume], capture_output=True)


if __name__ == "__main__":
    main()
