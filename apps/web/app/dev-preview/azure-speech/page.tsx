// 🔴 GONE IN PRODUCTION, NOT MERELY UNLINKED. The bench inside calls the real `/api/speech/*` routes
// with the owner's Azure credential behind them, and every request costs money and a quota slot on a
// free tier that allows twenty a minute. A page that is only "not linked from anywhere" is a page
// somebody finds. `NODE_ENV` is the gate, checked on the server before the bench is even sent.
//
// The routes it calls are production routes on purpose — the whole value of this bench is that it
// exercises exactly what a lesson will, rather than a parallel path that could pass while the real
// one is broken.
import { notFound } from "next/navigation";

import { AzureSpeechBench } from "./bench";

export default function AzureSpeechLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AzureSpeechBench />;
}
