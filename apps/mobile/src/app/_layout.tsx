import { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

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
    // Root gesture host — react-native-gesture-handler gestures (the Graph's
    // pinch/pan/node-drag) silently no-op unless the tree is wrapped in this.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

// Everything that must repaint with the theme lives below the provider: the OS
// background (no flash behind the UI in either mode), the Stack's content
// background, and the status-bar icon color.
function ThemedApp() {
  const { colors: c, resolvedMode } = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        {/* Settings slides up from the bottom as a sheet (ChatGPT-style), owner call. */}
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="record" options={{ presentation: "modal" }} />
      </Stack>
      <OfflineBanner />
      <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
    </SafeAreaProvider>
  );
}
