import { WaitlistForm } from "@/components/WaitlistForm";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="orb" />
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-24 text-center sm:pt-32">
        <span className="mb-5 rounded-full border border-teal-600/30 bg-teal-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-teal-700">
          Coming soon
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Understand your medications — straight from the evidence.
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-slate-600">
          PharmaOrb gives you clear, source-backed answers about drugs and supplements
          &mdash; every claim traced to FDA labels, PubMed, and ClinicalTrials.gov.
          Educational information, not medical advice.
        </p>
        <div className="mt-10 w-full max-w-md">
          <WaitlistForm />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Join the waitlist &mdash; we&rsquo;ll email you when the beta opens.
        </p>
      </div>
    </section>
  );
}
