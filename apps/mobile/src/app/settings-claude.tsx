import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNx } from "@/theme/nx";
import { NxIcon } from "@/components/nx/NxIcon";
import { AI_CONNECT_READY, startConnect } from "@/components/nx/settings/ai-connect";
import { AiLogo, Group, GroupRow, Pill, Sec, SettingsHeader } from "@/components/nx/settings/kit";

// One connected AI (canvas artboard "ClaudeDetail"). What Claude may do is a fact about the
// /api/mcp tool list, so it is shown. "Connected on", Recent activity and Disconnect need an
// endpoint that lists and revokes this account's AI grants; they are not drawn until it exists.

const CAN: [boolean, string][] = [
  [true, "Search and read your notes"],
  [true, "Create notes"],
  [true, "Make flashcards and practice tests"],
  [false, "Delete anything"],
];

export default function ClaudeDetailScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-claude">
      <SettingsHeader title="Claude" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 4 }}>
          <AiLogo kind="claude" size={52} radius={14} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.t1, fontSize: 20, lineHeight: 26, fontWeight: "600" }}>Claude</Text>
            <Text style={{ color: c.t2, fontSize: 14, lineHeight: 18 }}>{AI_CONNECT_READY ? "Not connected" : "Coming soon"}</Text>
          </View>
          {AI_CONNECT_READY ? <Pill label="Connect" tone="go" onPress={() => void startConnect("claude")} /> : null}
        </View>

        <Sec label={AI_CONNECT_READY ? "Claude can" : "Claude will be able to"} style={{ paddingHorizontal: 32 }} />
        <Group>
          {CAN.map(([ok, text]) => (
            <GroupRow
              key={text}
              lead={<NxIcon name={ok ? "check" : "x"} size={20} strokeWidth={2} color={ok ? c.ok : c.t3} />}
              title={text}
              titleColor={ok ? undefined : c.t2}
            />
          ))}
        </Group>
      </ScrollView>
    </View>
  );
}
