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

export const metadata: Metadata = {
  title: "Nemesis",
  description: "A contained academic agent that turns a semester into order.",
  // 🔴 TWO ICONS, BECAUSE A TAB STRIP HAS TWO COLOURS AND THE MARK HAS ONE (owner
  // 2026-08-20: "the nemesis favicon is not visible in light mode"). A single flat mark
  // on a transparent ground can only ever be right against one of them — whichever way
  // round it is shipped, the other theme renders ink on ink. Both assets already existed
  // in `public/nemesis`; only one of them was ever declared.
  //
  // 🔴 AND BOTH NOW CARRY THE THREE-STROKE MARK, NOT THE WINGED ONE (owner 2026-08-20:
  // "update the web favicon to the new mark"). The brand changed under the phone app first
  // — `apps/mobile/assets/images/*` and `TopBar`'s aspect went from 1.24 to 0.398 — and web
  // was simply left behind, still shipping the mark from `ca950e92`. Cut from the phone's
  // own `icon.png` so there is ONE master rather than a web tracing of it: trimmed to the
  // glyph, its antialiasing kept as the alpha channel, flat-filled black and white, and
  // centred on a 256 square at 92% height.
  //
  // 🔴 THESE TWO FILES ARE NOT ONLY THE FAVICON, which is the surprise waiting for anyone
  // who replaces them next. `AuthFrame` draws logo.png at 30px and 22px and `AccountPortal`
  // draws logo-white.png at 34px, so sign-in and the account screen change with the tab.
  // That is why the mark is centred on a SQUARE rather than cropped to its own 0.398 aspect:
  // those three call sites all pass equal width and height, and a bare glyph would stretch.
  //
  // 🔴 THE DARK MARK IS FIRST, AND THE ORDER IS THE FALLBACK. `media` on a favicon link is
  // honoured by current Chrome, Safari and Firefox; anything that ignores it takes the
  // first entry. First must therefore be the one that survives the widest range of tab
  // strips — dark ink, which is legible on white and on grey and merely dim on black,
  // where white ink on white would be nothing at all.
  icons: {
    icon: [
      { url: "/nemesis/logo.png", media: "(prefers-color-scheme: light)", type: "image/png" },
      { url: "/nemesis/logo-white.png", media: "(prefers-color-scheme: dark)", type: "image/png" },
    ],
  },
};

// Resolve the theme before first paint to avoid a flash. Two themes ship (light, dark); the DEFAULT
// preference is "system" — a fresh visitor follows their OS. A stored light/dark choice wins over the
// OS. The <html> tag intentionally carries NO data-theme literal: this inline script is the sole
// pre-hydration authority, so React can't re-stamp a hardcoded value over the resolved theme during
// hydration (that previously reverted a light choice back to dark on reload). A stored "grey" (from
// before that theme was removed) normalizes to "dark". On exception only, fall back to the dark anchor.
// Dark tone rides along: a stored "charcoal" must land before paint too, or charcoal users flash the
// pure-black default every load. Anything else resolves to "black".
const themeScript = `(function(){try{var p=localStorage.getItem('pharmaorb-theme');if(p==='grey')p='dark';var s=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var t=(p==='light'||p==='dark')?p:s;document.documentElement.setAttribute('data-theme',t);var dt=localStorage.getItem('nemesis.web.dark-tone');document.documentElement.setAttribute('data-dark-tone',dt==='charcoal'?'charcoal':'black');}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.setAttribute('data-dark-tone','black');}})();`;

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
