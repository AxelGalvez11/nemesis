import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Type system: Hanken Grotesk (variable, full wght axis — the heavy 800 display weight
// and body text) + JetBrains Mono for the technical labels. Self-hosted by next/font and
// exposed as CSS variables that globals.css maps into --sans / --mono.
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
  metadataBase: new URL("https://www.enternemesis.com"),
  title: "Nemesis — academic operating system for macOS",
  description:
    "Nemesis reads your school accounts, tracks every deadline and change, measures what you know, and drafts your work. It never submits. Local-first, for macOS.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Nemesis — academic operating system for macOS",
    description:
      "It knows what changed. It knows what comes next. It knows what you don't. Local-first, never submits.",
    type: "website",
    url: "/",
    siteName: "Nemesis",
    images: [{ url: "/nemesis/og.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nemesis — academic operating system for macOS",
    description:
      "It knows what changed. It knows what comes next. It knows what you don't. Local-first, never submits.",
    images: ["/nemesis/og.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hanken.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
