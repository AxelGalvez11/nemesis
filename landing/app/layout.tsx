import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PharmaOrb — Source-backed drug information",
  description:
    "Educational, evidence-backed answers about medications and supplements — every claim traced to FDA labels, PubMed, and ClinicalTrials.gov. Not medical advice. Join the waitlist.",
  openGraph: {
    title: "PharmaOrb — Source-backed drug information",
    description:
      "Educational, evidence-backed answers about medications — traced to FDA labels, PubMed, and ClinicalTrials.gov. Join the waitlist.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
