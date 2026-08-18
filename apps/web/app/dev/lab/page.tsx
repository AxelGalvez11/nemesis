import Link from "next/link";

const AREAS = [
  {
    body: "Drop a real PDF, PowerPoint, Word file or spreadsheet and see exactly what Nemesis read out of it — page by page, table by table, picture by picture. Nothing is cleaned up on the way to this screen.",
    href: "/dev/lab/parser",
    question: "What did Nemesis see?",
    title: "Parser",
  },
  {
    body: "Take a source you just inspected and learn from it, with a panel beside the lesson showing which objective was chosen, what was retrieved, what the model was asked, how the answer was marked, and what was written down about you.",
    href: "/dev/lab/tutor",
    question: "What did Nemesis think, and why did it do that next?",
    title: "Tutor",
  },
  {
    body: "Every bad parse and every bad teaching moment you save here can be run again after a change, so a fix can be proven and a regression cannot come back quietly.",
    href: "/dev/lab/replays",
    question: "Did we break it again?",
    title: "Replays",
  },
] as const;

export default function LabHome() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-lg font-semibold">Nemesis Lab</h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-400">
        A place to look directly at the two hidden halves of Nemesis: whether it understood your
        source, and whether it teaches from that understanding correctly. Everything here runs the
        real production code. The Lab only reports more of it.
      </p>
      <div className="mt-8 grid gap-4">
        {AREAS.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="block rounded border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold">{area.title}</span>
              <span className="text-xs text-neutral-500">{area.question}</span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">{area.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
