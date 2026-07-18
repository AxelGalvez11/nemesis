import type { Metadata } from "next";
import "./globals.css";
import "./styles/shell.css";
import "./styles/legacy.css";
import "./styles/auth.css";
import "./styles/account.css";
import { AuthProvider } from "@/components/AuthProvider";
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PostHogProvider>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
