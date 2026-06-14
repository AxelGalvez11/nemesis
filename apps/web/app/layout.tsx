import type { Metadata } from "next";
import "./globals.css";
import "./styles/shell.css";
import "./styles/legacy.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { PostHogProvider } from "@/components/PostHogProvider";

export const metadata: Metadata = {
  title: "PharmaOrb",
  description: "Source-grounded biomedical evidence — live, cited, dark.",
};

// Apply the stored theme before first paint to avoid a light→dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem('pharmaorb-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
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
