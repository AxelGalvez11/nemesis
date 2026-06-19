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

// Resolve the theme before first paint to avoid a flash. Themes: light, grey (soft dim), dark (true
// near-black). A stored choice wins; otherwise an OS dark preference resolves to GREY (the gentle
// default — users opt into the near-black "dark" explicitly), else light. Always writes an explicit
// data-theme so the CSS token sets resolve.
const themeScript = `(function(){try{var t=localStorage.getItem('pharmaorb-theme');if(t!=='light'&&t!=='grey'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'grey':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

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
