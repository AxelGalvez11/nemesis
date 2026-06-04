const PROPS = [
  {
    title: "Every answer is traceable",
    body: "No black-box claims. Each point cites its source — FDA labels, peer-reviewed research, and registered trials — so you can check the basis yourself.",
  },
  {
    title: "Follow what you take",
    body: "Track the medications and supplements you care about and get notified when new evidence lands.",
  },
  {
    title: "Educational, not medical advice",
    body: "PharmaOrb helps you ask better questions. It doesn’t diagnose, treat, or prescribe — always consult a qualified professional.",
  },
];

export function ValueProps() {
  return (
    <section className="border-t border-slate-100 bg-white">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 sm:grid-cols-3">
        {PROPS.map((p) => (
          <div key={p.title}>
            <h2 className="text-base font-semibold text-slate-900">{p.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
