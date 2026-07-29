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
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "Nemesis",
  description: "A contained academic agent that turns a semester into order.",
  icons: { icon: "/nemesis/logo.png" },
};

// Resolve the theme before first paint to avoid a flash. Two themes ship (light, dark); the DEFAULT
// preference is "system" — a fresh visitor follows their OS. A stored light/dark choice wins over the
// OS. The <html> tag intentionally carries NO data-theme literal: this inline script is the sole
// pre-hydration authority, so React can't re-stamp a hardcoded value over the resolved theme during
// hydration (that previously reverted a light choice back to dark on reload). A stored "grey" (from
// before that theme was removed) normalizes to "dark". On exception only, fall back to the dark anchor.
const themeScript = `(function(){try{var p=localStorage.getItem('pharmaorb-theme');if(p==='grey')p='dark';var s=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var t=(p==='light'||p==='dark')?p:s;document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

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
            <AuthProvider><ConfirmProvider>{children}</ConfirmProvider></AuthProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
