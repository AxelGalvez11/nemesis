"use client";

// Connected apps: what Nemesis can reach, and what it must ask about first.
//
// Owner's build order, workstream E. The safety line the owner agreed before this was built:
// **reading is free, writing asks first.** This screen states that in the learner's own words,
// because a permissions surface that does not say what it permits is a consent screen in name.
//
// 🔴 CONNECTING OPENS THE PROVIDER'S OWN SIGN-IN, IN A NEW TAB. Nemesis never sees a password —
// Google's page takes it, Composio holds the resulting token, and this product holds neither.
// The new tab matters: sending the learner away from a half-typed canvas to authorise Drive and
// dropping them back at the front door would lose their work.
//
// 🔴 "NOT SET UP YET" IS A REAL STATE AND IT SAYS SO. Without a server key this screen explains
// that rather than showing three dead buttons — this codebase's most-repeated defect is a control
// that does not do anything.

import { useCallback, useEffect, useState } from "react";

import { beginConnect, connectionStatus, disconnect, NOT_CONFIGURED, type ConnectionStatus } from "@/lib/workspace/composio-client";
import { groupApps } from "@/lib/workspace/composio-apps";
import { forgetToolCatalogue } from "@/lib/learn/canvas-tools";

export function ConnectionsSettings() {
  const [status, setStatus] = useState<ConnectionStatus>(NOT_CONFIGURED);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // 🔴 THE CANVAS'S CACHED CATALOGUE GOES WITH EVERY REFRESH. It holds what this learner can ask
    // Nemesis to do for up to two minutes (see canvas-tools.ts), and this screen is the only place
    // that list changes. Without this line, connecting Gmail and going straight to a canvas to ask
    // about your mail reads exactly like the connection not having worked.
    forgetToolCatalogue();
    setStatus(await connectionStatus());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(
    async (app: string) => {
      setBusy(app);
      setNotice(null);
      const url = await beginConnect(app);
      setBusy(null);
      if (!url) {
        setNotice("Could not start that connection. Try again in a moment.");
        return;
      }
      // 🔴 `noopener` — the provider's page must not get a handle on this one.
      window.open(url, "_blank", "noopener,noreferrer");
      setNotice("Finish signing in on the tab that just opened, then come back and refresh this page.");
    },
    [],
  );

  const remove = useCallback(
    async (app: string) => {
      setBusy(app);
      const ok = await disconnect(app);
      setBusy(null);
      setNotice(ok ? null : "Could not disconnect that app. Try again in a moment.");
      void refresh();
    },
    [refresh],
  );

  return (
    <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-xs font-semibold text-foreground">Your apps</h3>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-(--ui-text-tertiary)">
          Let Nemesis reach the places your material already lives. It can read freely once you connect
          something. Before it sends, posts, or deletes anything, it will always show you what it is about
          to do and wait for you to say yes.
        </p>
      </header>

      {!loaded ? (
        <p className="text-[0.7rem] text-(--ui-text-quaternary)">Loading…</p>
      ) : !status.configured ? (
        <p className="text-[0.7rem] leading-relaxed text-(--ui-text-quaternary)">
          Connections are not set up on this server yet. Once the app keys are in place, the places you
          keep your files, mail, notes and lectures will appear here.
        </p>
      ) : (
        // 🔴 GROUPED, BECAUSE NINE ROWS IN A COLUMN IS THE INTEGRATIONS DIRECTORY THE CLOSED
        // LIST EXISTS TO AVOID. Four headings say what a learner is reaching for, so the list is
        // read as "my files, my mail, my notes, my lectures" rather than scanned for a brand.
        <div className="flex flex-col gap-4">
          {groupApps(status.apps).map(({ apps, label }) => (
            <div key={label}>
              <p className="mb-1.5 text-[0.6rem] font-semibold tracking-wide text-(--ui-text-quaternary) uppercase">{label}</p>
              <ul className="flex list-none flex-col gap-1 p-0">
                {apps.map((app) => {
                  const on = status.connected.includes(app.key);
                  return (
                    <li
                      className="flex items-start justify-between gap-3 rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2.5"
                      key={app.key}
                    >
                      <div className="min-w-0">
                        <p className="text-[0.7rem] font-medium text-foreground">{app.label}</p>
                        <p className="mt-0.5 text-[0.65rem] leading-relaxed text-(--ui-text-tertiary)">{app.detail}</p>
                      </div>
                      <button
                        className="shrink-0 rounded-md border border-(--ui-stroke-secondary) px-2 py-1 text-[0.7rem] text-foreground transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-60"
                        disabled={busy === app.key}
                        onClick={() => void (on ? remove(app.key) : connect(app.key))}
                        type="button"
                      >
                        {busy === app.key ? "Working…" : on ? "Disconnect" : "Connect"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p className="mt-3 rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2 text-[0.7rem] leading-relaxed text-(--ui-text-secondary)" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
