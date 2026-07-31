import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";

// Type system: Hanken Grotesk only (variable, full wght axis: the heavy 800 display
// weight, body text, and tracked uppercase labels). Self-hosted by next/font and
// exposed as a CSS variable that globals.css maps into --sans.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/**
 * Arms the scroll-reveal animations BEFORE first paint.
 *
 * The hidden state (`opacity: 0`) lives behind `.js-reveal` in globals.css and
 * this is the only thing that ever adds that class. Two consequences, both
 * deliberate:
 *
 *   - With JavaScript off or broken, the class is never added, the hidden rules
 *     never match, and the page renders fully visible. A landing page that goes
 *     blank when one script fails is not a trade worth making for an animation.
 *   - With `prefers-reduced-motion`, the class is not added either, so the
 *     hidden state does not exist at all rather than being un-done afterwards.
 *
 * It must run before paint. Added after hydration it would show every section,
 * then hide them, then reveal them again — a flash on every load.
 */
const revealScript =
  "(function(){try{if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;" +
  "document.documentElement.classList.add('js-reveal');}catch(e){}})();";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.enternemesis.com"),
  title: "Nemesis: your AI study agent",
  description:
    "Nemesis turns your course files into notes, flashcards, and practice tests. It builds its knowledge from your library and gets better the more you use it. It never submits work for you.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Nemesis: your AI study agent",
    description:
      "Notes, flashcards, and practice tests from your own course files. It builds its knowledge from your library and gets better the more you use it.",
    type: "website",
    url: "/",
    siteName: "Nemesis",
    images: [{ url: "/nemesis/og.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nemesis: your AI study agent",
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
      </head>
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
