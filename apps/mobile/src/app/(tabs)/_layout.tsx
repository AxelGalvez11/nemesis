import { Redirect, Slot } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DrawerProvider } from "@/components/AppDrawer";
import { StatusBarBlur } from "@/components/StatusBarBlur";
import { TopBar } from "@/components/TopBar";
import { useTheme } from "@/theme/ThemeProvider";

// The app shell (liquid-glass redesign): the desktop layout, translated to the
// phone. ALL pages live in the sidebar drawer — Sessions · Chat · Library · Study ·
// Graph · Calendar — exactly like the desktop sidebar (owner call 2026-07-17: no
// bottom tab bar). The glass TopBar and the glass drawer float above the content,
// which scrolls underneath them; screens pad themselves via useShellPadding().
// Guarded: an un-authenticated, non-guest visitor is redirected to sign-in; a
// guest is let in and screens render guest affordances where a session is required.
export default function AppShellLayout() {
  const { session, isGuest, loading } = useAuth();
  const { colors: c } = useTheme();

  if (loading) {
    return (
      <View
        testID="auth-loading"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (!session && !isGuest) return <Redirect href="/sign-in" />;

  return (
    <DrawerProvider>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Slot />
        <StatusBarBlur />
        <TopBar />
      </View>
    </DrawerProvider>
  );
}
