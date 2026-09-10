import type { Metadata } from "next";
import { Inter } from "next/font/google";

/**
 * Loads Inter for /preview and every page under it, and nowhere else.
 *
 * 🔴 BEFORE THIS FILE EXISTED THE PREVIEW NEVER RENDERED IN INTER. Its stylesheet asked for
 * "Inter Variable", but the landing app only loads Hanken Grotesk and IBM Plex Mono, so the request
 * fell through to the system font. Measured 2026-09-10: text requested in "Inter Variable" was
 * 171.53px wide, exactly the same as -apple-system, and the only loaded face was Hanken Grotesk.
 *
 * Scoped by a CSS variable on a `display: contents` wrapper, so the live homepage keeps its own
 * type and nothing about page layout changes. `opsz` turns on Inter's optical-size axis, which is
 * the reason Inter was chosen over any other open face.
 */
/** Previews are for review, not search: keep every page under /preview out of search indexes. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.variable} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
