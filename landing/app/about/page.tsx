import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "About · Nemesis",
  description:
    "What Nemesis is, why it exists, and the line it won't cross.",
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">
        Nemesis<span className="dot"> · </span>About
      </div>
      <h1>About Nemesis</h1>

      {/* "lives on your Mac" until 2026-07-28. Nemesis is a browser app with an
          iPhone companion; the desktop app is deferred.

          "a study agent … gives you back notes, flashcards, practice tests" until
          2026-08-10. That was the old positioning, and leaving it here meant the
          homepage and the page one click behind it described two different products.
          This page stays the COMPANY story — why it exists, what it will not do —
          and does not repeat the tenets; those live on the homepage. */}
      <p className="legal-lead">
        Nemesis is a cognitive accelerator: it takes the material you have to learn and
        turns it into an adaptive path through that material, deciding as it goes what
        the next useful thing to do is. It runs in your browser, with an iPhone app for
        when you are in the lecture hall.
      </p>

      <h2>Why it exists</h2>
      <p>
        It started as one student&rsquo;s own frustration. Not with the learning, which
        is supposed to be hard, but with everything that came before it: one app for
        notes, another for flashcards, a third for the calendar, and hours spent
        building a study system every week before any studying could start.
      </p>
      <p>
        The machine is good at that part. People are not, and nothing is gained by
        making them do it. Nemesis exists to hand the preparation to the machine and
        give the person back the part that actually produces understanding.
      </p>

      <h2>How it gets better</h2>
      <p>
        Everything you and the system make lives in your library as plain files.
        That library is its memory: every file you add teaches it more about your
        classes, so it gets sharper the longer you use it.
      </p>

      <h2>The line it won&rsquo;t cross</h2>
      <p>
        Nemesis helps you learn. It doesn&rsquo;t do the work for you. It never
        submits coursework on your behalf. Drafts are yours to check, finish, and
        turn in.
      </p>

      <h2>Your files are yours</h2>
      <p>
        The library is plain markdown, exportable at any time and readable in any
        editor. No ads, no selling your data, no training on your content. Leave
        anytime and take everything with you.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:support@enternemesis.com">support@enternemesis.com</a>
      </p>
    </LegalShell>
  );
}
