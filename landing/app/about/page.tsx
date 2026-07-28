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
          iPhone companion; the desktop app is deferred. */}
      <p className="legal-lead">
        Nemesis is a study agent that runs in your browser, with an iPhone app for
        when you are in the lecture hall. You give it your course files, and it gives
        you back notes, flashcards, practice tests, and a calendar that knows your
        deadlines.
      </p>

      <h2>Why it exists</h2>
      <p>
        It started as one student&rsquo;s own study tool: one app for notes, another
        for flashcards, a third for the calendar, and a chat tab that forgot
        everything between sessions. Nemesis keeps the whole semester in one quiet
        place.
      </p>

      <h2>How it gets better</h2>
      <p>
        Everything you and the agent make lives in your library as plain files.
        That library is the agent&rsquo;s memory: every file you add teaches it more
        about your classes, so it gets sharper the longer you use it.
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
