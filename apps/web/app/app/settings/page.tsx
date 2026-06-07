"use client";

import Link from "next/link";
import { CreditCardIcon, FileTextIcon, LogOutIcon, ShieldIcon, UserIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  const { session, signOut } = useAuth();

  return (
    <>
      <PageHeader title="Settings" eyebrow="Account">
        Manage your account, billing, data controls, and legal pages.
      </PageHeader>
      <Tabs className="account-tabs" defaultValue="account">
        <TabsList className="account-tabs-list">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <div className="settings-grid">
            <Card className="account-card">
              <CardHeader>
                <CardTitle className="settings-title-row">
                  <UserIcon aria-hidden="true" />
                  Account
                </CardTitle>
                <CardDescription>{session?.user.email ?? "Signed in"}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="muted">Manage profile data, exports, and account deletion controls.</p>
              </CardContent>
              <CardFooter className="settings-actions">
                <Button asChild>
                  <Link href="/app/profile">Profile and data</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void signOut().then(() => window.location.assign("/sign-in"))}
                >
                  <LogOutIcon data-icon="inline-start" aria-hidden="true" />
                  Sign out
                </Button>
              </CardFooter>
            </Card>
            <Card className="account-card">
              <CardHeader>
                <CardTitle className="settings-title-row">
                  <ShieldIcon aria-hidden="true" />
                  Security posture
                </CardTitle>
                <CardDescription>Supabase-authenticated public beta account.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="muted">Personalized account actions stay behind your signed-in session.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="billing">
          <Card className="account-card">
            <CardHeader>
              <CardTitle className="settings-title-row">
                <CreditCardIcon aria-hidden="true" />
                Plan and billing
              </CardTitle>
              <CardDescription>Manage Plus checkout, invoices, and subscription status.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="muted">Plus unlocks higher Ask and watchlist limits as Stripe webhooks mirror subscription state into Supabase.</p>
            </CardContent>
            <CardFooter className="settings-actions">
              <Button asChild>
                <Link href="/app/billing">Open billing</Link>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="legal">
          <Card className="account-card">
            <CardHeader>
              <CardTitle className="settings-title-row">
                <FileTextIcon aria-hidden="true" />
                Privacy and legal
              </CardTitle>
              <CardDescription>Review data, terms, and medical-use boundaries.</CardDescription>
            </CardHeader>
            <CardContent className="legal-link-list">
              <Button asChild variant="outline">
                <Link href="/legal/privacy">Privacy policy</Link>
              </Button>
              <Separator />
              <Button asChild variant="outline">
                <Link href="/legal/terms">Terms</Link>
              </Button>
              <Separator />
              <Button asChild variant="outline">
                <Link href="/legal/disclaimer">Medical disclaimer</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
