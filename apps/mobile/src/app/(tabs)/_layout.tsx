import { useEffect, useRef, useState } from "react";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DrawerProvider, useShell } from "@/components/AppDrawer";
import { StatusBarBlur } from "@/components/StatusBarBlur";
import { TopBar } from "@/components/TopBar";
import { NxIconButton, NxTopTabs, type NxTabKey } from "@/components/nx/primitives";
import { ProfileMenu } from "@/components/nx/settings/ProfileMenu";
import { fetchLibrary } from "@/api/cloudLibrary";
import { listCalendarEvents } from "@/api/cloudCalendar";
import { readOnboarding } from "@/lib/onboarding";
import { decideOnboardingGate } from "@/lib/onboarding-gate";
import { useNx } from "@/theme/nx";

// The 2026-09 app shell (canvas "Nemesis iPhone Screens"): three tabs on top like Notion — Notes (home),
// Study, Chats. Signed-out visitors go to sign-in.
//
// 🔴 THE OLD FULL CHAT STILL RUNS INSIDE THE OLD CHROME. `/chat` is the working chat screen (2k lines,
// streaming, tools, recording) and it reads useShell() and pads for the glass TopBar, so it keeps its
// DrawerProvider + TopBar until the full-screen chat of the new design replaces it.
export default function AppShellLayout() {
  const { session, isGuest, loading } = useAuth();
  const c = useNx();

  if (loading) {
    return (
      <View testID="auth-loading" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
        <ActivityIndicator color={c.t2} />
      </View>
    );
  }
  if (!session && !isGuest) return <Redirect href="/sign-in" />;

  return (
    <DrawerProvider>
      <Frame />
    </DrawerProvider>
  );
}

function tabFor(path: string): NxTabKey | null {
  if (path === "/" || path === "/index") return "notes";
  if (path.startsWith("/study")) return "study";
  if (path.startsWith("/chats")) return "chats";
  return null;
}

function Frame() {
  const c = useNx();
  const path = usePathname();
  const router = useRouter();
  const { session, isGuest, signOut } = useAuth();
  const active = tabFor(path);
  const [profile, setProfile] = useState(false);

  // A student who closed the app partway through setup comes back signed in and never passes sign-in
  // again, so the same setup check sign-in uses runs here once per launch.
  const gated = useRef(false);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || gated.current) return;
    gated.current = true;
    void (async () => {
      try {
        const stored = await readOnboarding(SecureStore);
        if (stored) return;
        const decision = await decideOnboardingGate(stored, async () => {
          const [library, events] = await Promise.all([fetchLibrary(uid), listCalendarEvents(uid, { from: "2000-01-01", to: "2100-12-31" })]);
          return { hasLibrary: library.notes.length + library.folders.length > 0, hasEvents: events.length > 0 };
        });
        if (decision === "onboarding") router.replace("/onboarding" as never);
      } catch {
        // A failed check never blocks the app.
      }
    })();
  }, [session, router]);

  if (!active) return <LegacyFrame />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NxTopTabs
        active={active}
        initial={session?.user?.email ?? "N"}
        onAvatar={() => setProfile(true)}
        onChange={(k) => router.replace(k === "notes" ? "/" : k === "study" ? "/study" : "/chats")}
        right={
          active === "chats" ? (
            <NxIconButton icon="compose" label="New chat" onPress={() => router.push({ pathname: "/c/[id]", params: { id: "new" } })} />
          ) : active === "study" ? (
            <NxIconButton icon="search" label="Search" onPress={() => router.push("/search")} />
          ) : null
        }
      />
      {isGuest && !session ? (
        // 🔴 A way back out of guest mode. Without it a visitor who skipped sign-in could never sign in:
        // the avatar opens settings, and sign-in itself sends a guest straight back to the tabs.
        <Pressable
          onPress={() => void signOut()}
          style={{ marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: c.sunk, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ color: c.t2, fontSize: 14 }}>You are not signed in</Text>
          <Text style={{ color: c.acc, fontSize: 15, fontWeight: "600" }}>Sign in</Text>
        </Pressable>
      ) : null}
      <Slot />
      <ProfileMenu visible={profile} onClose={() => setProfile(false)} />
    </View>
  );
}

function LegacyFrame() {
  const { immersive } = useShell();
  const c = useNx();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Slot />
      {immersive ? null : (
        <>
          <StatusBarBlur />
          <TopBar />
        </>
      )}
    </View>
  );
}
