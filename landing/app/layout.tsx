import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

// Type system: Hanken Grotesk for body/UI, JetBrains Mono for labels/accent, and a
// high-contrast Didone serif (Playfair Display) for the editorial display headings and the
// giant wordmark — the look adapted from Hermes Agent's landing. All three are variable
// fonts (full wght axis loads), self-hosted by next/font, exposed as CSS variables that
// globals.css feeds into --f / --mono / --serif.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PharmaOrb: AI workspace for scientific evidence",
  description:
    "Deep research for biomedicine, life sciences, behavioral sciences, and health evidence. Build notebooks, deploy research agents, trace claims, monitor topics, and export deliverables.",
  openGraph: {
    title: "PharmaOrb: AI workspace for scientific evidence",
    description:
      "Build source-grounded notebooks, deploy research agents, trace scientific claims, monitor evidence, and export research deliverables.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the theme effect may add `class="light"` to <html> after
    // mount (read from localStorage), which would otherwise trip React's attribute check.
    <html
      lang="en"
      className={`${hanken.variable} ${jetbrains.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
