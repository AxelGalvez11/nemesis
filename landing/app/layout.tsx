import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

// The design spec uses Space Grotesk (weights 400–800). Google ships this family as a
// variable font with a wght axis of 300–700, so we load the variable axis (the CSS's
// `font-weight:800` declarations clamp to the 700 cap — exactly what the original
// <link rel=...wght@...800> delivered, since Google caps Space Grotesk at 700). next/font
// self-hosts it and exposes the --font-space-grotesk variable, which globals.css feeds --f.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PharmaOrb — Drug information that shows its work",
  description:
    "Plain-English answers about any medication or supplement — every claim traced to FDA labels, PubMed, and ClinicalTrials.gov. Not medical advice. Join the waitlist.",
  openGraph: {
    title: "PharmaOrb — Drug information that shows its work",
    description:
      "Plain-English answers about medications — every claim traced to FDA labels, PubMed, and ClinicalTrials.gov. Join the waitlist.",
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
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
