import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Match the app's type system (apps/web): Hanken Grotesk for everything, JetBrains Mono for
// code/accent. Both are variable fonts, so the full wght axis loads and the CSS's
// `font-weight:800` headings render at true 800 (Space Grotesk capped at 700). next/font
// self-hosts them and exposes --font-hanken / --font-jetbrains, which globals.css feeds --f / --mono.
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
    <html lang="en" className={`${hanken.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
