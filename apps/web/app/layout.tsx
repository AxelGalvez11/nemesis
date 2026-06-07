import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "PharmaOrb App",
  description: "Source-grounded biomedical evidence app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NuqsAdapter>
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="bottom-right"
            richColors
            toastOptions={{
              style: {
                background: "var(--surface)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                boxShadow: "var(--shadow)",
              },
            }}
          />
        </NuqsAdapter>
      </body>
    </html>
  );
}
