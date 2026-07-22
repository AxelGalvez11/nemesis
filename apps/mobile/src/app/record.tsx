import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { RecordSession } from "@/components/RecordSession";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// Thin route wrapper (owner 2026-07-21, "chat/recorder toggle from the
// webapp"): all the recording UI/logic now lives in RecordSession.tsx, shared
// with chat.tsx's inline record mode (the composer's mode pill). This screen's
// only job is the "screen chrome" that's specific to being a full-screen
// modal — safe-area padding and the route's own params contract — then it
// hands off to RecordSession. Still reached the same way it always was: the
// composer "+" menu's "Record" row (see ComposerPlusMenu.tsx), unchanged.
export default function RecordScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ c?: string }>();
  const threadId = (Array.isArray(params.c) ? params.c[0] : params.c) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: space(4), paddingBottom: Math.max(insets.bottom, space(4)) }}>
      <RecordSession userId={uid} threadId={threadId} onDone={() => router.back()} />
    </View>
  );
}
