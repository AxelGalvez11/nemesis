"use client";

// Last step: offer to reach the places the work the student just described already lives.
//
// Owner, 2026-08-31: *"part of the onboarding should be that users should be recommended to
// connect your calendar and stuff so that it can write stuff to the calendar."*
//
// 🔴 IT ASKS FOR NOTHING AND BLOCKS NOTHING. There is no Continue gate here: the flow's own
// footer carries the finish button, so a student who wants nothing connected presses it and is
// done. A first-run screen that will not let you past until you grant something is the single
// fastest way to lose the person on day one, and everything Nemesis does without a connection
// still works.
//
// 🔴 IT SAYS WHY, IN TERMS OF THE THING THEY JUST DID. They have spent three steps typing course
// names and watching dates come out of a syllabus. "Put those dates in your real calendar" is a
// sentence about their own work. "Grant access to Google Calendar" is a permissions demand for
// the same thing, and it converts far worse. See `ONBOARDING_SUGGESTED` for why these four.
//
// 🔴 CONNECTING OPENS THE PROVIDER'S OWN PAGE IN A NEW TAB, so this flow is never navigated away
// from and no half-finished setup is lost. Nemesis never sees a password. Coming back is what
// `focus` below is for: the student authorises in the other tab, returns to this one, and the row
// has to be right without them hunting for a refresh button.

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Check, Loader2 } from "@/lib/workspace/icons";
import {
  beginConnect,
  connectionStatus,
  NOT_CONFIGURED,
  type ConnectionStatus,
} from "@/lib/workspace/composio-client";
import { suggestedForOnboarding } from "@/lib/workspace/composio-apps";
import { forgetToolCatalogue } from "@/lib/learn/canvas-tools";

export function StepConnect() {
  const [status, setStatus] = useState<ConnectionStatus>(NOT_CONFIGURED);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 🔴 THE FOCUS LISTENER MUST NOT OUTLIVE THIS STEP. It fires on every return to the tab, and a
  // stale one would keep calling setState after the flow finished and unmounted.
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    // Same reason the Settings screen does this: the canvas caches which tools a learner can
    // reach for two minutes, and connecting here without clearing it reads exactly like the
    // connection not having worked.
    forgetToolCatalogue();
    const next = await connectionStatus();
    if (!alive.current) return;
    setStatus(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    // The student authorises in another tab and comes back to this one. Re-reading on focus is
    // what turns "Connect" into "Connected" without asking them to do anything.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const connect = useCallback(
    async (key: string) => {
      setBusy(key);
      setNotice(null);
      const url = await beginConnect(key);
      if (!alive.current) return;
      setBusy(null);
      if (!url) {
        setNotice("Could not start that connection. You can add it later in Settings.");
        return;
      }
      // 🔴 `noopener` — the provider's page must not get a handle on this one.
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [],
  );

  const rows = suggestedForOnboarding(status.apps);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">Let Nemesis reach your school</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Optional, and you can change it any time. Connect your calendar and the dates from your
          syllabus can land in it. Connect the site your school runs classes on and Nemesis can see
          what is due without you typing it.
        </p>
      </div>

      {!loaded ? (
        <p className="text-xs text-(--ui-text-quaternary)">Loading…</p>
      ) : !status.configured || rows.length === 0 ? (
        // 🔴 A REAL STATE, STATED PLAINLY, RATHER THAN DEAD BUTTONS. Without a key on the server
        // there is nothing to connect to, and this codebase's most-repeated defect is a control
        // that does not do anything.
        <p className="text-xs leading-relaxed text-(--ui-text-quaternary)">
          Connections are not set up on this server yet. You can carry on, and everything else works
          without them.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1 p-0">
          {rows.map((app) => {
            const on = status.connected.includes(app.key);
            return (
              <li
                className="flex items-start justify-between gap-3 rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2.5"
                key={app.key}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{app.label}</p>
                  <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">{app.detail}</p>
                </div>
                {on ? (
                  // 🔴 STATUS, NOT A CONTROL. There is nothing to toggle here — a connection is
                  // account-wide, and disconnecting during first-run setup is not a thing anyone
                  // wants to do. Settings owns that.
                  <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-(--ui-action)">
                    <Check size={13} /> Connected
                  </span>
                ) : (
                  <Button
                    disabled={busy === app.key}
                    onClick={() => void connect(app.key)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {busy === app.key ? <Loader2 className="animate-spin" size={13} /> : null}
                    Connect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <p className="rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2 text-xs leading-relaxed text-(--ui-text-secondary)" role="status">
          {notice}
        </p>
      )}

      <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-quaternary)">
        Nemesis reads freely once you connect something. Before it sends, posts or deletes anything,
        it shows you what it is about to do and waits for you to say yes. There are more apps in
        Settings.
      </p>
    </section>
  );
}
