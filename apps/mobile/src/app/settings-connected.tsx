import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNx } from "@/theme/nx";
import { AI_CONNECT_READY, copyConnectLink, startConnect } from "@/components/nx/settings/ai-connect";
import { AiLogo, Group, GroupRow, IconBox, NavTrail, Pill, Sec, SettingsHeader } from "@/components/nx/settings/kit";

// Connected AI and apps (canvas artboard "ConnectedApps").
// Honest limits: the OAuth server behind /api/mcp is off (see ai-connect.ts), so Connect and
// Copy link only appear once AI_CONNECT_READY is on. The Apps section (Google Calendar, Anki) is
// not drawn: the phone has no call that reads either connection yet.

const pillWrap = { minHeight: 44, justifyContent: "center" as const };

export default function ConnectedAppsScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const status = AI_CONNECT_READY ? "Not connected" : "Coming soon";

  const copy = async () => {
    if (await copyConnectLink()) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-connected">
      <SettingsHeader title="Connected AI and apps" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Sec label="AI that can use your notes" style={{ paddingHorizontal: 32, paddingTop: 16 }} />
        <Group>
          <GroupRow
            lead={<AiLogo kind="claude" />}
            title="Claude"
            meta={AI_CONNECT_READY ? "Reads and writes notes and cards" : status}
            trail={<NavTrail />}
            onPress={() => router.push("/settings-claude" as never)}
          />
          <GroupRow
            lead={<AiLogo kind="gpt" />}
            title="ChatGPT"
            meta={status}
            trail={AI_CONNECT_READY ? <View style={pillWrap}><Pill label="Connect" tone="go" onPress={() => void startConnect("gpt")} /></View> : undefined}
          />
          {AI_CONNECT_READY ? (
            <GroupRow
              lead={<IconBox icon="link" />}
              title="Another AI tool"
              meta="Connect with a link"
              trail={<View style={pillWrap}><Pill label={copied ? "Copied" : "Copy link"} icon={copied ? "check" : "copy"} onPress={() => void copy()} /></View>}
            />
          ) : null}
        </Group>
        <Text style={{ paddingTop: 8, paddingHorizontal: 32, fontSize: 13, lineHeight: 18, color: c.t2 }}>
          {AI_CONNECT_READY
            ? "Connected AI acts as you. It can never delete your notes or cards."
            : "Soon Claude and ChatGPT can read your notes and make cards for you. They will never be able to delete anything."}
        </Text>
      </ScrollView>
    </View>
  );
}
