// Nemesis Lab — the internal testing environment. Localhost only.
//
// 🔴 IT OBSERVES THE SYSTEM; IT IS NOT A SECOND SYSTEM. Every parse on these pages is
// `parseDocument`, every teaching decision is `controllerFor`, every verdict is
// `evaluateLearningResponse`, every evidence row is `recordEvidence`. What the Lab adds is
// reporting: the whole DocumentModel instead of the text, the whole turn instead of the question.
// If a page here ever needs its own parser or its own tutor to work, the page is wrong.
//
// 🔴 THE GATE IS `lib/lab/gate.ts`, SHARED WITH EVERY `/api/dev/lab/*` ROUTE. A `notFound()` here
// alone would hide the pages and leave the unauthenticated parse endpoint answering in production.

import Link from "next/link";
import { notFound } from "next/navigation";

import { labEnabled } from "@/lib/lab/gate";

export const metadata = { title: "Nemesis Lab" };

const AREAS = [
  { href: "/dev/lab/parser", label: "Parser", hint: "Did Nemesis understand the source?" },
  { href: "/dev/lab/tutor", label: "Tutor", hint: "Given that, does it teach correctly?" },
  { href: "/dev/lab/replays", label: "Replays", hint: "Saved failures, rerun." },
] as const;

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (!labEnabled()) notFound();
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-baseline gap-6 border-b border-neutral-800 px-5 py-3">
        <Link href="/dev/lab" className="text-sm font-semibold tracking-tight">
          Nemesis Lab
        </Link>
        <nav className="flex gap-4 text-sm">
          {AREAS.map((area) => (
            <Link key={area.href} href={area.href} className="text-neutral-400 hover:text-neutral-100" title={area.hint}>
              {area.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-[11px] text-neutral-500">
          localhost only · never shown to learners
        </span>
      </header>
      {children}
    </div>
  );
}
