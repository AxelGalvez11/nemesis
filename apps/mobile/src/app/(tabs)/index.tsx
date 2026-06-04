import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { GuestState } from "@/components/states";
import { common } from "@/theme/common";

// Ask tab (stub). The full cited-answer + safety routing flow lands in 6b-3.
export default function AskTab() {
  const { session } = useAuth();
  return (
    <View style={common.screen} testID="tab-ask">
      <Text style={common.h1}>Ask</Text>
      {session ? (
        <Text style={common.body} testID="ask-placeholder">
          Ask a medication question — the cited-answer flow lands in 6b-3.
        </Text>
      ) : (
        <GuestState body="Sign in to ask medication questions." />
      )}
    </View>
  );
}
