import Link from "next/link";

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
        <h1>Medical Disclaimer</h1>
        <section>
          <h2>Not medical advice</h2>
          <p>
            Nemesis is for educational research only. It does not diagnose, treat, prescribe,
            recommend a treatment plan, or replace a licensed healthcare professional.
          </p>
        </section>
        <section>
          <h2>Emergencies</h2>
          <p>
            If you may be experiencing a medical emergency, call emergency services or seek urgent
            medical care immediately. Nemesis is not designed for emergency triage.
          </p>
        </section>
        <section>
          <h2>Evidence limits</h2>
          <p>
            Biomedical evidence can be incomplete, conflicting, outdated, or not applicable to your
            personal situation. Always inspect sources and discuss decisions with a qualified
            clinician or pharmacist.
          </p>
        </section>
        <section>
          <h2>Medication and supplement decisions</h2>
          <p>
            Do not start, stop, combine, dose, or change any medication, supplement, peptide, or
            health intervention based only on Nemesis output.
          </p>
        </section>
      </article>
    </main>
  );
}
