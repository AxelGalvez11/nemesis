"use client";

// The panel that hands a deck to somebody, and takes it back.
//
// Owner's build order, workstream G.
//
// 🔴🔴 IT SAYS WHAT SHARING MEANS BEFORE IT MAKES A LINK, AND THAT IS NOT A COURTESY. Sharing is
// publishing: anyone with the link can read the cards without signing in. A learner pressing a
// share icon has not necessarily understood that, so the panel states it in one plain sentence
// and only then offers the button. Consent that was not informed is not consent.
//
// 🔴 AND IT SAYS WHAT IS *NOT* SHARED, because that is the part people worry about and cannot
// verify. Their name, their other decks, and how they are doing on these cards all stay private
// — enforced in `app/api/shared/[token]/route.ts`, which selects front and back and nothing else.
//
// 🔴 TURNING IT OFF IS ONE PRESS AND IS IMMEDIATE. The row is deleted, so every copy of the link
// stops working at once. Said plainly rather than left to be discovered.

import { useCallback, useEffect, useState } from "react";

import { revokeShare, shareDeck, shareTokenFor, shareUrl } from "@/lib/workspace/deck-sharing";

export function DeckShare({
  deck,
  onClose,
  userId,
}: {
  deck: { id: string; name: string };
  onClose: () => void;
  userId: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = await shareTokenFor(userId, deck.id);
      if (!alive) return;
      setToken(found);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [deck.id, userId]);

  // Escape closes, matching every other overlay in the canvas surface.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const next = await shareDeck(userId, deck.id);
    setBusy(false);
    if (!next) {
      setFailed(true);
      return;
    }
    setToken(next);
  }, [deck.id, userId]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await revokeShare(userId, deck.id);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    setToken(null);
    setCopied(false);
  }, [deck.id, userId]);

  const url = token && typeof window !== "undefined" ? shareUrl(token, window.location.origin) : "";

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 🔴 A CLIPBOARD REFUSAL IS NOT AN ERROR WORTH A RED BOX. The link is on screen and
      // selectable; the learner can copy it the ordinary way.
      setCopied(false);
    }
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" onClick={onClose} role="presentation">
      <section
        aria-label={`Share ${deck.name}`}
        className="w-[min(30rem,calc(100vw-3rem))] rounded-2xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">
          Share {deck.name.split("::").at(-1)}
        </h2>

        <p className="mt-2 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)">
          Anyone with the link can read these cards and save a copy, without signing in. Your name, your
          other decks, and how you are doing on these cards are not shared.
        </p>

        {!loaded ? (
          <p className="mt-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">Loading…</p>
        ) : token ? (
          <div className="mt-4 flex flex-col gap-2">
            <input
              aria-label="Share link"
              className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-transparent px-3 py-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-primary)"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={url}
            />
            <div className="flex flex-wrap gap-2">
              <button className={BUTTON} onClick={() => void copy()} type="button">
                {copied ? "Copied" : "Copy link"}
              </button>
              <button className={BUTTON} disabled={busy} onClick={() => void turnOff()} type="button">
                {busy ? "Working…" : "Stop sharing"}
              </button>
            </div>
            <p className="text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
              Stopping is immediate. Every copy of the link stops working.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={BUTTON} disabled={busy} onClick={() => void turnOn()} type="button">
              {busy ? "Working…" : "Create a link"}
            </button>
            <button className={BUTTON} onClick={onClose} type="button">
              Not now
            </button>
          </div>
        )}

        {failed && (
          <p className="mt-3 text-[length:var(--canvas-text-meta)] leading-relaxed text-(--ui-text-secondary)" role="alert">
            Sharing is not available yet on this account. Nothing has changed.
          </p>
        )}
      </section>
    </div>
  );
}

const BUTTON =
  "rounded-lg border border-(--ui-stroke-tertiary) bg-transparent px-3 py-1.5 text-[length:var(--canvas-text-meta)] " +
  "text-(--ui-text-primary) transition-colors hover:bg-(--ui-control-hover-background) disabled:opacity-60";
