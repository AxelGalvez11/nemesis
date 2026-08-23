import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./styles/shell.css";
import "./styles/legacy.css";
import "./styles/auth.css";
import "./styles/account.css";
// Last, so its phone overrides win over the desktop rules above at equal
// specificity. See the file header for why these are not `max-sm:` utilities.
import "./styles/mobile.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ConfirmProvider } from "@/components/desktop-ui/confirm-dialog";
import { PromptProvider } from "@/components/desktop-ui/prompt-dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { accentPrePaintScript } from "@/lib/accent";

export const metadata: Metadata = {
  title: "Nemesis",
  description: "A contained academic agent that turns a semester into order.",
  // 🔴 NO `icons` HERE ANY MORE, AND THAT IS THE FIX. This pointed at /nemesis/logo.png — the
  // OLD mark, a raster of the glossy-bead logo — while the marketing site had already moved to
  // app/icon.svg, the flat three-bead mark. Two products, two different icons in the tab strip.
  // Next serves app/icon.svg and app/apple-icon.tsx automatically on every route, so the two
  // apps now share one mark by sharing one source rather than by both remembering to declare it.
};

// Resolve the theme before first paint to avoid a flash. Two themes ship (light, dark); the DEFAULT
// preference is "system" — a fresh visitor follows their OS. A stored light/dark choice wins over the
// OS. The <html> tag intentionally carries NO data-theme literal: this inline script is the sole
// pre-hydration authority, so React can't re-stamp a hardcoded value over the resolved theme during
// hydration (that previously reverted a light choice back to dark on reload). A stored "grey" (from
// before that theme was removed) normalizes to "dark". On exception only, fall back to the dark anchor.
// Dark tone rides along: a stored "charcoal" must land before paint too, or charcoal users flash the
// pure-black default every load. Anything else resolves to "black".
//
// 🔴 AND SO DOES THE ACCENT, WHICH IT DID NOT (owner 2026-08-21: "there is a discrepancy between the
// color chosen in settings and the chat composer send button"). Theme and dark tone were resolved
// here while the accent was applied only from `ThemeProvider`'s mount effect — so every load painted
// the send button, the focus rings and the chrome tint in the DEFAULT accent and swapped them once
// React came up. That is the same flash this script exists to prevent, on the product's most
// prominent control. `accentPrePaintScript` serialises the real colour table rather than repeating
// it; see lib/accent.ts.
const themeScript =
  `(function(){try{var p=localStorage.getItem('pharmaorb-theme');if(p==='grey')p='dark';var s=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var t=(p==='light'||p==='dark')?p:s;document.documentElement.setAttribute('data-theme',t);var dt=localStorage.getItem('nemesis.web.dark-tone');document.documentElement.setAttribute('data-dark-tone',dt==='charcoal'?'charcoal':'black');}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-dark-tone','black');}})();` +
  accentPrePaintScript();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="nemesis-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <PostHogProvider>
          <ThemeProvider>
            {/* Innermost, so every surface can ask — Study, Library, Calendar,
                Notebooks and both shells all delete things. See
                components/desktop-ui/confirm-dialog.tsx. */}
            <AuthProvider><ConfirmProvider><PromptProvider>{children}</PromptProvider></ConfirmProvider></AuthProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
