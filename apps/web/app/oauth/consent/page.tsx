"use client";

// Where Supabase Auth sends a person when an outside AI tool (ChatGPT, Claude and others) asks to act for them in
// Nemesis (docs/space/PLAN.md, M11). Supabase keeps the request under `authorization_id`; this page shows who is asking
// and what the tool will be able to do, and records the answer. Supabase then sends the person back to the tool, with a
// code when they allowed it and a refusal when they did not.

import "@/app/styles/auth.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthFrame } from "@/components/AuthFrame";
import { useAuth } from "@/components/AuthProvider";
import { signInRedirect } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

interface AccessRequest {
  tool: string;
  email: string;
  returnHost: string;
}

type View = { kind: "loading" } | { kind: "ask"; request: AccessRequest } | { kind: "sending" } | { kind: "error"; message: string };

/** What the door lets a tool do (app/api/mcp/route.ts). Kept in step with the tools listed there. */
const ABILITIES = ["Read the pages in your workspace and the names of your flashcard decks", "Create pages, flashcards and practice tests for you"];

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

function Consent() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace(signInRedirect(pathname, params.toString()));
      return;
    }
    if (!authorizationId) {
      setView({ kind: "error", message: "This link is missing the request it belongs to. Start connecting again from the AI tool." });
      return;
    }
    let live = true;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!live) return;
      if (error || !data) {
        setView({ kind: "error", message: "This request has expired or was already answered. Start connecting again from the AI tool." });
        return;
      }
      if ("redirect_url" in data) {
        // Allowed before, so Supabase already has the answer: straight back to the tool.
        setView({ kind: "sending" });
        window.location.assign(data.redirect_url);
        return;
      }
      setView({ kind: "ask", request: { tool: data.client.name || "An AI tool", email: data.user.email, returnHost: hostOf(data.redirect_uri) } });
    });
    return () => {
      live = false;
    };
  }, [authorizationId, loading, params, pathname, router, session]);

  const answer = async (allow: boolean) => {
    setView({ kind: "sending" });
    const { data, error } = allow
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url) {
      setView({ kind: "error", message: "Your answer could not be saved. Start connecting again from the AI tool." });
      return;
    }
    window.location.assign(data.redirect_url);
  };

  if (view.kind === "ask") {
    const { request } = view;
    return (
      <AuthFrame description={`${request.tool} is asking to work in Nemesis as ${request.email}.`} minimal title={`Connect ${request.tool}`}>
        <div className="nemesis-auth-form">
          <div className="nemesis-auth-notice">
            <p>It will be able to:</p>
            <ul>
              {ABILITIES.map((ability) => (
                <li key={ability}>{ability}</li>
              ))}
            </ul>
          </div>
          <p className="nemesis-auth-legal">
            It acts only as you and cannot see anyone else's work. You can disconnect it any time from Agents in the sidebar.
            {request.returnHost ? ` You will go back to ${request.returnHost}.` : ""}
          </p>
          <button className="nemesis-auth-submit" onClick={() => void answer(true)} type="button">
            Allow
          </button>
          <button className="nemesis-auth-textbtn" onClick={() => void answer(false)} type="button">
            Don&apos;t allow
          </button>
        </div>
      </AuthFrame>
    );
  }

  const description =
    view.kind === "error" ? view.message : view.kind === "sending" ? "Sending you back to the AI tool." : "Checking the request.";
  return (
    <AuthFrame description={description} minimal title="Connect an AI tool">
      <div className="nemesis-auth-form" />
    </AuthFrame>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={null}>
      <Consent />
    </Suspense>
  );
}
