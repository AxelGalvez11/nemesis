import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nemesis — Pricing",
  description: "The AI that runs your semester. Sync your school, turn lectures into flashcards and notes, get cited answers — all on your Mac.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
