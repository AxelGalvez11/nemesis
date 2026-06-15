"use client";

import { PageHeader } from "@/components/ui";
import { ProfilePanel } from "@/components/ProfilePanel";

// Full-page Profile (direct URL). The same ProfilePanel also renders inside the account-menu overlay.
export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" eyebrow="Account">
        Your signed-in beta account and current entitlement snapshot.
      </PageHeader>
      <ProfilePanel />
    </>
  );
}
