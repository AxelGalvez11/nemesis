import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Type system: Hanken Grotesk only (variable, full wght axis: the heavy 800 display
// weight, body text, and tracked uppercase labels). Self-hosted by next/font and
// exposed as a CSS variable that globals.css maps into --sans.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.enternemesis.com"),
  title: "Nemesis: a study agent for your Mac",
  description:
    "Nemesis turns your course files into notes, flashcards, and practice tests. It builds its knowledge from your library and gets better the more you use it. Your files stay on your Mac, and it never submits work for you.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Nemesis: a study agent for your Mac",
    description:
      "Notes, flashcards, and practice tests from your own course files. It builds its knowledge from your library and gets better the more you use it.",
    type: "website",
    url: "/",
    siteName: "Nemesis",
    images: [{ url: "/nemesis/og.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nemesis: a study agent for your Mac",
    description:
      "Notes, flashcards, and practice tests from your own course files. It builds its knowledge from your library and gets better the more you use it.",
    images: ["/nemesis/og.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <body>{children}</body>
    </html>
  );
}
