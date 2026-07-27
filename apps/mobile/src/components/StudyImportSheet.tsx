import { useEffect, useMemo, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { parseStudyTextImport, type StudyTextImportSource } from "@nemesis/shared";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { importStudyTextDeck } from "@/api/cloudStudy";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import { MissionButton } from "./mission-ui";
import { SlideUpSheet } from "./StudySheet";

export function StudyImportSheet({
  onClose,
  onImported,
  source,
  userId,
  visible,
}: {
  onClose: () => void;
  onImported: () => void;
  source: StudyTextImportSource;
  userId: string;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [deckName, setDeckName] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parseStudyTextImport(raw, source), [raw, source]);
  const label = source === "anki" ? "Anki" : "Quizlet";

  useEffect(() => {
    if (!visible) return;
    setDeckName("");
    setRaw("");
    setBusy(false);
    setError(null);
  }, [source, visible]);

  async function paste() {
    const value = await Clipboard.getStringAsync();
    if (value) setRaw(value);
  }

  async function runImport() {
    if (!deckName.trim() || parsed.cards.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await importStudyTextDeck(userId, deckName, parsed.cards, source);
      onImported();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import did not finish.");
      setBusy(false);
    }
  }

  return (
    <SlideUpSheet visible={visible} onClose={busy ? () => undefined : onClose} title={`Import from ${label}`} fullScreen testID={`study-import-${source}`}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.instructions}>
          {source === "anki"
            ? "In Anki, export Notes in Plain Text. Copy the tab-separated rows, then paste them here."
            : "In Quizlet, open Export and choose a tab between term and definition. Copy the rows, then paste them here."}
        </Text>

        <Text style={styles.label}>Deck name</Text>
        <TextInput
          autoCapitalize="sentences"
          onChangeText={setDeckName}
          placeholder="Biology review"
          placeholderTextColor={c.textHint}
          style={styles.input}
          testID="study-import-deck-name"
          value={deckName}
        />

        <View style={styles.cardsHeader}>
          <Text style={styles.label}>Cards</Text>
          <MissionButton label="Paste" onPress={() => void paste()} testID="study-import-paste" variant="secondary" />
        </View>
        <TextInput
          multiline
          onChangeText={setRaw}
          placeholder={"Term\tDefinition\nSecond term\tSecond definition"}
          placeholderTextColor={c.textHint}
          scrollEnabled
          style={styles.cardsInput}
          testID="study-import-cards"
          textAlignVertical="top"
          value={raw}
        />

        <Text style={styles.summary}>
          {parsed.cards.length.toLocaleString()} card{parsed.cards.length === 1 ? "" : "s"} ready
          {parsed.skipped ? ` · ${parsed.skipped.toLocaleString()} empty or duplicate row${parsed.skipped === 1 ? "" : "s"} skipped` : ""}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <MissionButton
          busy={busy}
          disabled={busy || !deckName.trim() || parsed.cards.length === 0}
          label={busy ? "Importing…" : `Import ${parsed.cards.length.toLocaleString()} cards`}
          onPress={() => void runImport()}
          testID="study-import-submit"
          variant="primary"
        />
      </ScrollView>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    cardsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    cardsInput: {
      ...type.body,
      backgroundColor: c.surface2,
      borderColor: c.line,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      color: c.text,
      fontFamily: "Courier",
      minHeight: 260,
      padding: space(3),
    },
    content: { gap: space(3), paddingBottom: space(10) },
    error: { ...type.small, color: c.danger },
    input: {
      ...type.body,
      backgroundColor: c.surface2,
      borderColor: c.line,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      color: c.text,
      minHeight: 48,
      paddingHorizontal: space(3),
    },
    instructions: { ...type.body, color: c.text2, lineHeight: 22 },
    label: { ...type.small, color: c.text, fontWeight: "700" },
    summary: { ...type.small, color: c.text2 },
  });
