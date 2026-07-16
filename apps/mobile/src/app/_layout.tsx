import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import { AuthProvider } from "@/auth/AuthProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { bootstrapAnalytics } from "@/lib/analyticsBootstrap";
import { flushAnalytics } from "@/lib/analytics";
import { setupPushResponseRouting } from "@/lib/push";
import { c } from "@/theme/tokens";

// Missions-only navigation (iOS dispatch plan, Task 6): the app's home route "/"
// resolves to src/app/(tabs)/index.tsx (an expo-router route GROUP — the parens
// don't appear in the URL), which now renders the missions list + composer instead
// of the old PharmaOrb chat screen. Nothing below needs to change to make that the
// home screen; this Stack has no explicit route list, it just wraps whatever file
// matched. compare.tsx and the other evidence screens stay reachable by direct file
// route but are no longer linked from the drawer (see AppDrawer.tsx).

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function RootLayout() {
  // Restore analytics consent + (if a PostHog key is configured) connect PostHog.
  // No key → inert no-op. Best-effort: bootstrapAnalytics never throws.
  useEffect(() => {
    void bootstrapAnalytics(SecureStore, {
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    });
    // Paint the OS background near-black so there's no white flash behind the dark UI.
    void SystemUI.setBackgroundColorAsync(c.bg);
  }, []);

  // Push notification tap → mission detail (Task 9). Wired once at root, independent
  // of auth state, so it's armed as soon as the app is; the destination screen
  // handles its own guest/no-session state.
  useEffect(() => setupPushResponseRouting(), []);

  // Flush batched analytics when the app leaves the foreground (events would
  // otherwise be lost if the OS suspends/kills the app). No-op without a sink.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushAnalytics();
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
          <OfflineBanner />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
