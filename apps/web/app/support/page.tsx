import Link from "next/link";
import type { Metadata } from "next";

/**
 * The Support URL Apple's submission form requires (App Store Connect →
 * App Information → Support URL). That field is mandatory and nothing on either
 * domain answered it: there was no support, contact, or help route anywhere in
 * `apps/web/app` or `landing/app`.
 *
 * It lives at the top level rather than under /legal because a support page is
 * not a legal document, and /support is the address a person would guess. Top
 * level is also what makes it PUBLIC — auth gating lives in the (workspace)
 * route group, so anything outside it is reachable signed out, which is the
 * whole point of a URL you hand to a reviewer.
 *
 * It reuses the `legal-*` classes so it can't drift away from the privacy and
 * terms pages visually; those three are the only pages a stranger sees.
 */

export const metadata: Metadata = {
  description:
    "Get help with Nemesis: contact support, recover an account, manage a plan, or delete your data.",
  title: "Support — Nemesis",
};

const SUPPORT_EMAIL = "support@enternemesis.com";

export default function SupportPage() {
  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" href="/">Nemesis</Link>
        <div>
          <Link className="source-link" href="/legal/privacy">Privacy</Link>
          <Link className="source-link" href="/legal/terms">Terms</Link>
        </div>
      </nav>
      <article className="legal-content">
        <p className="eyebrow">Help</p>
        <h1>Support</h1>
        <p className="muted">
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and a person will read it.
        </p>

        <section>
          <h2>Getting in touch</h2>
          <p>
            Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> about anything —
            a bug, a question, a refund, or an account you cannot get back into. Telling us
            which device you were on and roughly when it happened makes it far quicker to
            find. Replies usually take a day or two.
          </p>
        </section>

        <section>
          <h2>Trouble signing in</h2>
          <p>
            You can sign in with an email and password, with Google, or with Apple. If you
            first signed up with Google or Apple, use that same button rather than a password —
            the account is tied to it. If a password reset email does not arrive, check the
            spam folder before writing in, and tell us the address you used.
          </p>
        </section>

        <section>
          <h2>Recordings and notes</h2>
          <p>
            Lectures are transcribed after the recording ends, so a long one takes a few
            minutes to appear. A recording that stays stuck, or notes that come back empty,
            is worth reporting with the date and rough length — we can look up what happened
            to that specific file.
          </p>
        </section>

        <section>
          <h2>Plans and billing</h2>
          <p>
            Plans are managed here on the web, not inside the phone app — sign in and open
            your account page to change or cancel one. Cancelling leaves your account and
            everything in it intact; you simply drop back to the free allowance at the end of
            the period you have already paid for.
          </p>
        </section>

        <section>
          <h2>Deleting your account</h2>
          <p>
            In the phone app, open Settings and choose Delete account. It is real and
            permanent: it removes the login along with the notes, chats, flashcards,
            recordings, and calendar entries that belong to it, and there is no undo.
          </p>
          <p>
            If you want a copy of your data first — or instead — email us and we will send you
            everything held against your account.
          </p>
        </section>

        <section>
          <h2>When an answer looks wrong</h2>
          <p>
            Nemesis answers with AI, and AI gets things wrong. In the phone app every answer
            can be reported, which sends us the exact question and the exact response so we
            can see what happened. Please do report them — it is the fastest way the product
            gets better, and we would rather know.
          </p>
        </section>
      </article>
    </main>
  );
}
