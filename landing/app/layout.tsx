import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";

// Type system: two faces, with a strict division of labour.
//
// Hanken Grotesk (variable, full wght axis) is the page's voice — the lowercase
// editorial headlines, body copy, everything a visitor actually reads.
//
// IBM Plex Mono is its READ-OUT: state labels, the tenet numerals, the learner-model
// table, the loop stage names. It was drawn for technical instrumentation, which is
// exactly the register those fragments occupy, and keeping it off the prose is what
// stops the page reading as a terminal emulator. Two weights, latin only.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
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

// SEO. The old title was "Nemesis: your AI study agent" and the description listed
// notes, flashcards and practice tests — the exact "generator of study material"
// positioning the product moved away from. What a search result has to say now is
// the category, because the category is the thing nobody has heard of yet.
//
// The title stays sentence-case rather than lowercase: a browser tab and a search
// result are chrome someone scans, not the page's own voice, and lowercase there
// costs recognition for nothing.
//
// "a cognitive accelerator" until 2026-08-15. The homepage rebuild replaced that
// noun with the verb, on the grounds that "accelerate cognition" says the same
// thing better — and a tab reading the rejected phrase while the page reads the
// new one is the same idea stated twice, badly. The verb still names the category,
// which is the whole reason this string is not the product name alone.
const TITLE = "Nemesis: accelerate cognition";
const DESCRIPTION =
  "Nemesis turns lectures, textbooks and course material into an adaptive path through knowledge. It asks you to retrieve, reads what your answer shows, and changes what comes next. The machine prepares. You learn.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.enternemesis.com"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/",
    siteName: "Nemesis",
    images: [{ url: "/nemesis/og.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/nemesis/og.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script below adds `js-reveal` to <html> before
    // React hydrates, so the client tag legitimately differs from the server's and
    // React logs a mismatch it then refuses to patch. The app's own layout.tsx
    // suppresses the same warning for the same reason (its theme script).
    <html
      lang="en"
      className={`${hanken.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
      </head>
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
