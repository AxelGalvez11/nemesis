import { Inter } from "next/font/google";

/**
 * Loads Inter (with its optical-size axis) for the design-system page, which sets its type in Inter. The app itself is
 * still set in the system stack until the app-screens pass, so the face is scoped to this route rather than to the app.
 */
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-system-inter", display: "swap" });

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.variable} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
