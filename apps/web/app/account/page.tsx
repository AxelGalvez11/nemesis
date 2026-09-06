"use client";

// Retired 2026-09-05. Everything this page did (name, email, password, two-step, data export,
// delete account, billing) now lives in Settings. Old links, bookmarks and the desktop app still
// arrive here, so the page sends them on instead of 404ing.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AccountPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings");
  }, [router]);
  return <p style={{ padding: 24 }}>Taking you to settings…</p>;
}
