import { ImageResponse } from "next/og";

/**
 * The home-screen icon.
 *
 * PNG rather than SVG because iOS does not accept an SVG touch icon, and
 * generated at build time from the same geometry rather than checked in as a
 * binary — a committed PNG is a second copy of the mark that nothing forces to
 * stay in sync, and the first person to adjust an oval would leave it stale.
 *
 * OPAQUE WHITE PLATE, deliberately, and the one place the mark does not follow
 * the theme. iOS composites a home-screen icon over whatever the wallpaper is
 * and does not honour prefers-color-scheme for it, so a transparent icon gets an
 * arbitrary background and a dark-mode-inverted one would be white-on-white for
 * half of all users. Black on white is the safe, correct plate.
 *
 * Geometry is identical to app/icon.svg and components/NemesisMark.tsx.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-66 -10 232 232"><g fill="#000"><ellipse cx="50" cy="40" rx="62" ry="20" transform="rotate(-36 50 40)"/><ellipse cx="50" cy="106" rx="62" ry="20" transform="rotate(-36 50 106)"/><ellipse cx="50" cy="172" rx="62" ry="20" transform="rotate(-36 50 172)"/></g></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* 73% of the plate. iOS rounds the corners and crops slightly, so a
            mark run edge to edge loses its tips. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`}
          width={132}
          height={132}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
