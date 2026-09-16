import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addCard, createDeck } from "@/api/study";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxIconButton } from "@/components/nx/primitives";
import { NxFootButton } from "@/components/nx/study";
import { goBack } from "@/lib/goBack";
import { nxType, useNx } from "@/theme/nx";

type Draft = { key: string; front: string; back: string };

const blank = (): Draft => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, front: "", back: "" });

// Writing a set by hand (owner, canvas comment 2026-09-16: "add a button and page to make create cards").
// Name it, write the cards, save. Sets made here have no page, so they sit on their own in Study.
export default function NewSetScreen() {
  const c = useNx();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [cards, setCards] = useState<Draft[]>([blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const ready = cards.filter((d) => d.front.trim() && d.back.trim());
  const set = (key: string, part: "front" | "back", text: string) =>
    setCards((list) => list.map((d) => (d.key === key ? { ...d, [part]: text } : d)));

  const save = async () => {
    if (!ready.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const deckId = await createDeck(name.trim() || "Flashcards", null);
      for (const d of ready) await addCard(deckId, d.front, d.back);
      void qc.invalidateQueries({ queryKey: ["study-decks"] });
      router.replace({ pathname: "/set/[id]", params: { id: deckId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The set could not be saved. Try again.");
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 3 }]}>
        <NxIconButton icon="chev_l" size={22} label="Back" onPress={() => goBack(router)} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, lineHeight: 22, fontWeight: "600", color: c.t1 }}>New set</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name this set"
            placeholderTextColor={c.t3}
            selectionColor={c.acc}
            style={[nxType.pageTitle, { color: c.t1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }]}
          />
          <Text style={[nxType.section, { color: c.t2, paddingHorizontal: 20, paddingTop: 8 }]}>Cards</Text>

          <View style={{ paddingHorizontal: 16, paddingTop: 6, gap: 10 }}>
            {cards.map((d, i) => (
              <View key={d.key} style={[styles.card, { backgroundColor: c.card, borderColor: c.ln }]}>
                <View style={styles.cardHead}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: c.t3 }}>{i + 1}</Text>
                  {cards.length > 1 ? (
                    <Pressable
                      onPress={() => setCards((list) => list.filter((x) => x.key !== d.key))}
                      hitSlop={10}
                      accessibilityLabel={`Remove card ${i + 1}`}
                    >
                      <NxIcon name="x" size={16} color={c.t3} strokeWidth={2} />
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={d.front}
                  onChangeText={(t) => set(d.key, "front", t)}
                  placeholder="Question"
                  placeholderTextColor={c.t3}
                  selectionColor={c.acc}
                  multiline
                  style={{ fontSize: 16, lineHeight: 22, fontWeight: "500", color: c.t1, paddingVertical: 6 }}
                />
                <View style={[styles.rule, { backgroundColor: c.ln }]} />
                <TextInput
                  value={d.back}
                  onChangeText={(t) => set(d.key, "back", t)}
                  placeholder="Answer"
                  placeholderTextColor={c.t3}
                  selectionColor={c.acc}
                  multiline
                  style={{ fontSize: 15, lineHeight: 21, color: c.t1, paddingVertical: 6 }}
                />
              </View>
            ))}

            <Pressable
              onPress={() => {
                setCards((list) => [...list, blank()]);
                setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
              }}
              style={({ pressed }) => [styles.add, { borderColor: c.ring, backgroundColor: pressed ? c.soft : "transparent" }]}
              accessibilityRole="button"
            >
              <NxIcon name="plus" size={17} color={c.t1} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: "500", color: c.t1 }}>Add a card</Text>
            </Pressable>

            {error ? <Text style={{ fontSize: 14, lineHeight: 20, color: c.danger, paddingHorizontal: 4 }}>{error}</Text> : null}
            <Text style={{ fontSize: 14, lineHeight: 20, color: c.t3, paddingHorizontal: 4 }}>
              Cards with an empty question or answer are left out.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <NxFootButton
        label={saving ? "Saving" : ready.length ? `Save ${ready.length} card${ready.length === 1 ? "" : "s"}` : "Save set"}
        disabled={!ready.length || saving}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 2 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 20 },
  rule: { height: 1, marginVertical: 2 },
  add: { height: 46, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
});
