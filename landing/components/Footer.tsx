export function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-12 text-center text-xs leading-5 text-slate-500">
        <p>
          PharmaOrb provides educational information from public sources such as FDA labels,
          PubMed, and ClinicalTrials.gov. It is not medical advice and does not diagnose,
          treat, or prescribe. Always consult a qualified healthcare professional for
          personal medical decisions.
        </p>
        <p>
          We only use your email to notify you about the beta. This page does not collect
          health information.
        </p>
        <p className="text-slate-500">© 2026 PharmaOrb. All rights reserved.</p>
      </div>
    </footer>
  );
}
