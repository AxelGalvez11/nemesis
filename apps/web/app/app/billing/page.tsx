"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon, CreditCardIcon, ExternalLinkIcon, GaugeIcon } from "lucide-react";
import type { EntitlementSnapshot } from "@pharmabro/shared";
import { useAuth } from "@/components/AuthProvider";
import { ErrorText, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchEntitlements } from "@/lib/api";

export default function BillingPage() {
  const { session } = useAuth();
  const [ent, setEnt] = useState<EntitlementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchEntitlements().then(setEnt).catch((e) => setError(e instanceof Error ? e.message : "Billing failed"));
  }, []);

  async function post(path: string) {
    setBusy(path);
    setError(null);
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Sign in first");
      const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.message || body.error || "Stripe request failed");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Billing" eyebrow="Stripe Plus">
        Upgrade to Plus for 100 cited questions per day and 50 watchlist follows.
      </PageHeader>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div className="grid two">
        <Card className="account-card">
          <CardHeader>
            <div className="row">
              <CardTitle className="settings-title-row">
                <GaugeIcon aria-hidden="true" />
                Current plan
              </CardTitle>
              <Badge variant="secondary">{ent?.plan ?? "free"}</Badge>
            </div>
            <CardDescription>Plan updates are mirrored from Stripe webhooks into Supabase subscriptions.</CardDescription>
          </CardHeader>
          <CardContent className="billing-limit-list">
            <div>
              <span className="muted">Ask daily limit</span>
              <strong>{String(ent?.entitlements.ask_daily_limit ?? 10)}</strong>
            </div>
            <Separator />
            <div>
              <span className="muted">Watchlist follows</span>
              <strong>{String(ent?.entitlements.watchlist_limit ?? 3)}</strong>
            </div>
          </CardContent>
          <CardFooter>
            <Button disabled={busy === "/api/stripe/portal"} variant="outline" onClick={() => void post("/api/stripe/portal")}>
              <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
              {busy === "/api/stripe/portal" ? "Opening..." : "Manage billing"}
            </Button>
          </CardFooter>
        </Card>
        <Card className="account-card plus-card">
          <CardHeader>
            <CardTitle className="settings-title-row">
              <CreditCardIcon aria-hidden="true" />
              PharmaOrb Plus
            </CardTitle>
            <CardDescription><strong>$12/month</strong></CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="billing-feature-list">
              <li><CheckCircle2Icon aria-hidden="true" />100 Ask questions per day</li>
              <li><CheckCircle2Icon aria-hidden="true" />50 watchlist follows</li>
              <li><CheckCircle2Icon aria-hidden="true" />Plus monitoring surfaces as they roll out</li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button disabled={busy === "/api/stripe/checkout"} onClick={() => void post("/api/stripe/checkout")}>
              <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
              {busy === "/api/stripe/checkout" ? "Opening checkout..." : "Upgrade to Plus"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
