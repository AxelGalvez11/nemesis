import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { AuthProvider } from "@/auth/AuthProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { bootstrapAnalytics } from "@/lib/analyticsBootstrap";
import { flushAnalytics } from "@/lib/analytics";

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
          <Stack screenOptions={{ headerShown: false }} />
          <OfflineBanner />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
