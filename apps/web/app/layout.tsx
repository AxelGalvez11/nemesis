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

// Resolve the theme before first paint to avoid a flash. Only two themes: light, dark (true
// ChatGPT-black). "system" resolves OS dark to DARK. A stored preference of "grey" (from before
// that theme was removed) is normalized to "dark" so existing users don't break.
const themeScript = `(function(){try{var p=localStorage.getItem('pharmaorb-theme');if(p==='grey')p='dark';var s=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var t=(p==='light'||p==='dark')?p:s;document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
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
