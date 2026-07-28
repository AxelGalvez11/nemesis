import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

// REWRITTEN 2026-07-28. The previous version described a Mac desktop app: "local-first
// by design", "what stays on your Mac", "your course files … are stored on your device",
// "Nemesis does not upload your library". None of that is true of the web and iPhone
// apps, where the library IS stored in the student's Nemesis account. A privacy policy
// that misstates where data lives is the one page that must not be left stale, so this
// describes what the code actually does:
//   - library, decks, calendar and chat live in Postgres, per-user, behind row-level
//     security (supabase/migrations)
//   - a recording is uploaded to the `recordings` bucket and DELETED as soon as it has
//     been transcribed (removeObject in supabase/functions/nemesis-transcribe)
//   - transcription is sent to a third-party speech provider
//   - metering records token and minute COUNTS, never prompt text (the PostHog payload
//     in _shared/llm-cost.ts carries usage and money only)

export const metadata: Metadata = {
  title: "Privacy Policy · Nemesis",
  description:
    "Where your work is stored, what Nemesis collects, and what we never do with your data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell>
      <div className="legal-kicker">
        Legal<span className="dot"> · </span>Privacy
      </div>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Effective July 2026</p>

      <p className="legal-lead">
        Nemesis runs in your browser and on your phone. This policy covers this website and
        the Nemesis app, and explains where your work is kept, what we collect, and what we
        will never do with it.
      </p>

      <h2>Where your work is stored</h2>
      <p>
        Your library, notes, flashcards, practice tests, calendar, and chats are stored in
        your Nemesis account on our servers, so that they are there on every device you sign
        in from. Each account&rsquo;s data is isolated at the database level: one
        account&rsquo;s work cannot be read by another.
      </p>

      <h2>Recordings</h2>
      <p>
        When you record a lecture, the audio is uploaded so it can be transcribed, and it is
        deleted from our storage as soon as the transcript comes back. The transcript and the
        notes made from it stay in your library. Transcription is performed by a third-party
        speech provider, which receives the audio for that purpose and nothing else.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account information: the email address you sign up with and your subscription status.</li>
        <li>Metering: counts of how much you have used, never the content, to apply plan limits.</li>
        <li>Payments are processed by our payment provider; we do not store card numbers.</li>
      </ul>

      <h2>When your content is sent on</h2>
      <p>
        When you ask the assistant something, that request and whatever you attached to it are
        sent to our model provider to produce the answer, and used for nothing else. Recordings
        go to our speech provider to be transcribed. Nemesis does not send email or submit
        coursework on your behalf.
      </p>

      <h2>What we never do</h2>
      <ul>
        <li>No selling or sharing of personal data.</li>
        <li>No advertising and no ad tracking.</li>
        <li>No training on your content.</li>
      </ul>

      <h2>This website</h2>
      <p>
        This site sets no advertising trackers. If you create an account, the email you
        provide is used to operate your account and tell you about the product you signed up
        for, and nothing else.
      </p>

      <h2>Your work is yours</h2>
      <p>
        Notes and decks can be exported at any time, on any plan or none. Delete your account
        and we delete the account and the work stored in it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:support@enternemesis.com">support@enternemesis.com</a>
      </p>
    </LegalShell>
  );
}
