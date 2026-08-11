"use client";

// Retired surfaces: send people to the Canvas home, without breaking what still points here.
//
// Study, Library and Chill are no longer navigable — the product is Canvas plus Calendar, and
// everything those pages did is a capability inside a Canvas session now. But "not navigable"
// and "not reachable" are different things, and the audit found live callers that would break
// if they were confused:
//
//   • the SHIPPED browser extension opens app.enternemesis.com/library?import=coursework
//   • /slides and the graph navigate back to /library?note=<path>
//   • agent-tools.ts mints artifact cards linking to /study?section=cards|tests|mindmaps
//   • reader-anchor.ts documents /library/source/<id>?page=&q= as its deep-link format
//
// 🔴 SO THE RULE IS: A BARE VISIT REDIRECTS, A DEEP LINK STILL WORKS. Someone who typed
// /library or kept a bookmark lands on the Canvas home; a link that carries parameters is a
// caller asking for something specific, and it is served exactly as before. That distinction is
// the whole reason this is a guard rather than a `redirect()` at the top of each page.
//
// This is temporary scaffolding, not architecture. It comes out at Phase G, once the extension
// has shipped a build that points somewhere else and the artifact cards have been re-pointed —
// and not before, because an extension in the wild updates slowly or never.

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function RetiredSurfaceGuard({
  children,
  /** False for surfaces with no known deep links — Chill has none, so every visit redirects. */
  allowDeepLinks = true,
}: {
  children: React.ReactNode;
  allowDeepLinks?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // A caller that asked for something specific brought parameters with it.
  const isDeepLink = allowDeepLinks && params.toString().length > 0;

  useEffect(() => {
    if (!isDeepLink) router.replace("/learn");
  }, [isDeepLink, router]);

  // 🔴 Render nothing while the redirect is in flight. Rendering the retired page first would
  // flash the surface we are retiring — and on a slow client it is not a flash, it is the page.
  if (!isDeepLink) return <main className="h-full bg-(--ui-bg-editor)" />;
  return <>{children}</>;
}
