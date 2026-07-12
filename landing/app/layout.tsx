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
  title: "Nemesis — a contained academic agent for macOS",
  description:
    "Nemesis is an academic agent with persistent memory, reusable skills, scheduled automation, delegated tasks, and authorized browser access—governed by scoped tools, isolated task contexts, and a standing rule: it never submits on your behalf.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Nemesis — a contained academic agent for macOS",
    description:
      "It remembers. It learns. It acts—inside your scope. Persistent memory, reusable skills, scheduled automation, and one standing rule: you submit.",
    type: "website",
    url: "/",
    siteName: "Nemesis",
    images: [{ url: "/nemesis/og.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nemesis — a contained academic agent for macOS",
    description:
      "It remembers. It learns. It acts—inside your scope. Persistent memory, reusable skills, scheduled automation, and one standing rule: you submit.",
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
