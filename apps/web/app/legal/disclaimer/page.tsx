import Link from "next/link";

// 🔴 THIS PAGE WAS TITLED "MEDICAL DISCLAIMER" AND WAS ENTIRELY ABOUT MEDICATION, SUPPLEMENTS AND
// PEPTIDES. Owner, 2026-08-25: *"remove medical disclaimer claims, this is a general research tool
// not a medical tool."*
//
// It was the loudest thing the public site still said about what Nemesis is. A law student reading
// the footer of a study app and finding a page about dosing peptides learns something wrong about
// the product, and CLAUDE.md's rule is that Nemesis is field-agnostic: it may KNOW about medicine
// and may never present itself as being about medicine.
//
// 🔴 GENERALISED RATHER THAN DELETED, AND THAT IS A DELIBERATE DIFFERENCE. Removing the medical
// framing is what was asked for. Removing all cover would be a separate decision with a real cost:
// a study tool that answers any question WILL be asked medical, legal, financial and safety ones,
// by nursing students and by everybody else, and saying "this is not professional advice" is not a
// claim to be a medical product. So medicine appears here as one example among several instead of
// as the subject, which is exactly the shape the rest of the product already uses.
export default function DisclaimerPage() {
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
        <p className="eyebrow">Safety</p>
        <h1>Disclaimer</h1>
        <section>
          <h2>Nemesis is for studying</h2>
          <p>
            Nemesis is educational software for learners in any field. It helps you read, understand
            and revise material. It is not professional advice, and it is not a substitute for a
            qualified person in any discipline, whether that is a clinician, a lawyer, an engineer,
            an accountant or an instructor.
          </p>
        </section>
        <section>
          <h2>A citation is not a guarantee</h2>
          <p>
            Nemesis shows you where an answer came from so you can check it. A cited source can
            still be outdated, contested, misread, or wrong about your particular case. Sources are
            there to be inspected, not to stand in for having read them.
          </p>
        </section>
        <section>
          <h2>Decisions with real consequences</h2>
          <p>
            Do not make a decision that affects health, legal standing, money, or physical safety on
            the basis of Nemesis output alone. That includes medication and treatment, legal filings
            and deadlines, financial commitments, and anything structural or electrical. Those
            decisions need a qualified person who knows your situation.
          </p>
        </section>
        <section>
          <h2>Emergencies</h2>
          <p>
            Nemesis is not an emergency service and is not monitored. If someone is in danger, call
            your local emergency number.
          </p>
        </section>
      </article>
    </main>
  );
}
