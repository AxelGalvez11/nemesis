import type { Metadata } from "next";
import "./globals.css";
import "./styles/shell.css";
import "./styles/legacy.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "PharmaOrb",
  description: "Source-grounded biomedical evidence — live and cited.",
};

// Resolve the theme before first paint to avoid a flash. Preference can be system/light/grey/dark.
// System keeps the current gentle behavior: OS dark resolves to grey; users opt into true dark.
const themeScript = `(function(){try{var p=localStorage.getItem('pharmaorb-theme');if(p!=='system'&&p!=='light'&&p!=='grey'&&p!=='dark'){p='system';}var dark=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var t=p==='system'?(dark?'grey':'light'):p;document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-theme-preference',p);}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-theme-preference','system');}})();`;

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
