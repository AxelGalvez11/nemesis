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

// The app's home route "/" resolves through src/app/(tabs)/index.tsx (an
// expo-router route group — the parentheses do not appear in the URL).

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

  // Notification taps are routed once at root, independent of auth state.
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
      </Stack>
      <OfflineBanner />
      <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
    </SafeAreaProvider>
  );
}
