"use client";

// DEV-ONLY PREVIEW — the mascot lab.
//
// Same convention as the other dev-preview routes: a plain client page, no auth gate,
// not linked from any navigation. Nothing the product ships imports it.
//
// `/mascot-lab` redirects here, so the short URL works without adding a top-level
// route to the app's own namespace.

import { MascotLab } from "@/components/dev/mascot-lab/lab";

import "@/components/mascot/mascot.css";
import "@/components/dev/mascot-lab/mascot-lab.css";

export default function MascotLabPage() {
  return <MascotLab />;
}
