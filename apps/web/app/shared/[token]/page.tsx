"use client";

// What a classmate sees when they open a shared deck.
//
// Owner's build order, workstream G. One student in a class can mean the class.
//
// 🔴🔴 OUTSIDE `(workspace)`, DELIBERATELY. This page is for someone who has never heard of
// Nemesis and is not signed in: no sidebar, no rail, no canvases. Putting it inside the
// workspace layout would render an app shell full of controls that all require an account
// around a page whose entire job is to be readable without one.
//
// 🔴 IT ASKS FOR NOTHING BEFORE SHOWING THE CARDS. No sign-in wall, no email capture, no
// "create an account to continue". A share that demands a signup before it shows anything is a
// lead-capture form wearing a deck's clothes, and it would kill the one growth channel this
// feature exists for. Reading is free; taking a copy is what needs an account, and only because
// a copy has to live in somebody's library.
//
// 🔴 A DEAD LINK SAYS SO PLAINLY AND OFFERS A WAY OUT. Revoked and never-existed are the same
// 404 by design — see the route's header — so this cannot distinguish them either, and does not
// try to.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { copySharedDeck, loadSharedDeck, type SharedDeck } from "@/lib/workspace/deck-sharing";

export default function SharedDeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [deck, setDeck] = useState<SharedDeck | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { token } = await params;
      const found = await loadSharedDeck(token);
      if (!alive) return;
      setDeck(found);
      setState(found ? "ready" : "missing");
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  const take = useCallback(async () => {
    if (!deck || copying) return;
    setCopying(true);
    const id = await copySharedDeck(uid, deck);
    setCopying(false);
    setCopied(id);
  }, [copying, deck, uid]);

  if (state === "loading") {
    return <Shell><p className="text-sm text-(--ui-text-tertiary)">Loading…</p></Shell>;
  }

  if (state === "missing" || !deck) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-(--ui-text-primary)">This link is not working</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-(--ui-text-secondary)">
          It may have been turned off by whoever shared it, or the address may be slightly wrong. Ask them
          for a fresh link.
        </p>
        <a className="mt-5 inline-block text-sm text-(--ui-text-secondary) underline" href="/learn">
          Go to Nemesis
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="w-full max-w-2xl">
        <p className="text-xs uppercase tracking-wide text-(--ui-text-quaternary)">Shared deck</p>
        <h1 className="mt-1 text-lg font-semibold text-(--ui-text-primary)">{deck.name}</h1>
        <p className="mt-1 text-sm text-(--ui-text-tertiary)">
          {deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}
        </p>

        <div className="mt-4">
          {copied ? (
            <a className="text-sm text-(--ui-text-primary) underline" href={`/library?deck=${copied}`}>
              Saved to your library. Start reviewing.
            </a>
          ) : uid ? (
            <button
              className="rounded-xl border border-(--ui-stroke-secondary) bg-transparent px-3 py-1.5 text-sm text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-60"
              disabled={copying}
              onClick={() => void take()}
              type="button"
            >
              {copying ? "Saving…" : "Save to my library"}
            </button>
          ) : (
            // 🔴 THE SIGN-IN PROMPT COMES AFTER THE CARDS ARE ALREADY VISIBLE, and it says what
            // signing in is FOR. "Sign in to continue" over hidden content is the wall this page
            // refuses to be.
            <a className="text-sm text-(--ui-text-secondary) underline" href="/learn">
              Sign in to save these to your own library
            </a>
          )}
        </div>
      </header>

      <ul className="mt-6 flex w-full max-w-2xl list-none flex-col gap-1 p-0">
        {deck.cards.map((card, index) => (
          <li
            className="rounded-xl border border-(--ui-stroke-tertiary) px-4 py-3"
            key={`${index}-${card.front.slice(0, 24)}`}
          >
            <p className="text-sm text-(--ui-text-primary)">{card.front}</p>
            <p className="mt-1 text-sm leading-relaxed text-(--ui-text-secondary)">{card.back}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-(--ui-bg-primary) px-6 py-12">{children}</main>
  );
}
