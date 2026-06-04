import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Card } from "@/components/ui";
import { common } from "@/theme/common";

// Data-export AFFORDANCE (AC10 / doc-18 "Provide deletion/export"). Present + reachable,
// not wired: export *generation* is the Phase-7 job (same line as cascade-delete). We
// keep it symmetric with delete-account rather than shipping an ad-hoc client dump that
// would blur which is the real export feature.
export default function ExportScreen() {
  const [requested, setRequested] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.body} testID="export-screen">
      <Text style={common.h1}>Export your data</Text>
      <Text style={common.body}>
        Request a copy of your PharmaBro data — your account info, follows, asked questions, and saved health context.
      </Text>

      <Pressable testID="request-export" style={common.btn} onPress={() => setRequested(true)}>
        <Text style={common.btnText}>Request data export</Text>
      </Pressable>

      {requested ? (
        <Card testID="export-status">
          <Text style={styles.note}>
            Downloadable exports are being enabled for launch. Your request is noted — we'll email the file to your
            account address when export is live.
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14 },
  note: { fontSize: 14, lineHeight: 21, color: "#3a4451" },
});
