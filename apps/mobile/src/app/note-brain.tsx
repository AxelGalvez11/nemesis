import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { brainAction } from "@/api/brain";
import {
  fetchLibrary,
  loadCachedLibrary,
  type CloudLibraryNote,
} from "@/api/cloudLibrary";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock } from "@/components/mission-ui";
import { Skeleton } from "@/components/Skeleton";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/palette";
import { control, radius, space, type } from "@/theme/tokens";

interface Proposal {
  confidence: number;
  id: string;
  reason: string;
  relation: string | null;
  target_document_id: string | null;
  trigger_kind: string;
}

interface Edge {
  id: string;
  relation: string;
  source_document_id: string;
  target_document_id: string | null;
  target_ref: string;
}

export default function NoteBrainScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const documentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [notes, setNotes] = useState<CloudLibraryNote[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const note = useMemo(
    () => notes.find((item) => item.id === documentId) ?? null,
    [documentId, notes],
  );

  const load = useCallback(async () => {
    if (!userId || !documentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const cached = await loadCachedLibrary(userId);
    setNotes(cached.notes);
    const [{ data: proposalRows }, { data: edgeRows }] = await Promise.all([
      supabase
        .from("library_organization_proposals")
        .select("id,target_document_id,relation,reason,confidence,trigger_kind")
        .eq("source_document_id", documentId)
        .eq("status", "pending")
        .order("confidence", { ascending: false }),
      supabase
        .from("library_link_edges")
        .select("id,source_document_id,target_document_id,target_ref,relation")
        .or(
          `source_document_id.eq.${documentId},target_document_id.eq.${documentId}`,
        )
        .order("updated_at", { ascending: false }),
    ]);
    setProposals((proposalRows ?? []) as Proposal[]);
    setEdges((edgeRows ?? []) as Edge[]);
    setLoading(false);
    void fetchLibrary(userId).then((fresh) => setNotes(fresh.notes)).catch(() => {});
  }, [documentId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(async (
    proposal: Proposal,
    action: "apply" | "reject",
  ) => {
    setBusy(true);
    setMessage(null);
    const ok = await brainAction(action, { proposalId: proposal.id });
    setBusy(false);
    setMessage(ok
      ? action === "apply"
        ? "Connection added to the note."
        : "Suggestion dismissed."
      : "That suggestion could not be updated.");
    if (ok) await load();
  }, [load]);

  const organize = useCallback(async () => {
    if (!documentId) return;
    setBusy(true);
    setMessage("Looking across related notes…");
    const ok = await brainAction("organize", { documentId });
    setBusy(false);
    setMessage(ok
      ? "Review complete. Strong suggestions are ready."
      : "Nemesis could not review this note right now.");
    if (ok) await load();
  }, [documentId, load]);

  const noteName = useCallback((id: string | null, fallback: string) => {
    return notes.find((item) => item.id === id)?.title ?? fallback;
  }, [notes]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable
          accessibilityLabel="Back to note"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
        >
          <GlassSurface style={styles.backButton} fallbackColor={c.glassPanel} shadow>
            <Text style={styles.backGlyph}>‹</Text>
          </GlassSurface>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Second brain</Text>
          <Text numberOfLines={1} style={styles.title}>{note?.title ?? "Connections"}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading && notes.length === 0 ? (
        <View style={styles.loading}>
          <Skeleton width="74%" height={26} />
          <Skeleton width="100%" height={118} style={styles.skeletonCard} />
          <Skeleton width="100%" height={88} style={styles.skeletonCard} />
        </View>
      ) : !note ? (
        <View style={styles.empty}>
          <EmptyBlock
            title="Note unavailable"
            body="It may have been deleted or has not synced to this phone yet."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + space(8) },
          ]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Voyage finds nearby ideas. Nemesis classifies only strong relationships
            and waits for you before changing the note.
          </Text>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Suggested</Text>
            <Text style={styles.sectionCount}>{proposals.length}</Text>
          </View>
          {proposals.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No strong suggestions yet.</Text>
            </View>
          ) : proposals.map((proposal) => (
            <View key={proposal.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {noteName(proposal.target_document_id, "Linked note")}
                </Text>
                <View style={styles.relationPill}>
                  <Text style={styles.relationText}>
                    {(proposal.relation ?? "connection").replaceAll("_", " ")}
                  </Text>
                </View>
              </View>
              <Text style={styles.reason}>{proposal.reason}</Text>
              <View style={styles.actions}>
                <Pressable
                  disabled={busy}
                  onPress={() => void decide(proposal, "apply")}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && styles.actionPressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryLabel}>Add connection</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => void decide(proposal, "reject")}
                  style={({ pressed }) => [
                    styles.quietAction,
                    pressed && styles.actionPressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Text style={styles.quietLabel}>Not now</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            disabled={busy}
            onPress={() => void organize()}
            style={({ pressed }) => [
              styles.organizeButton,
              pressed && styles.actionPressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.organizeLabel}>
              {busy ? "Reviewing…" : "Find connections"}
            </Text>
          </Pressable>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Connected</Text>
            <Text style={styles.sectionCount}>{edges.length}</Text>
          </View>
          {edges.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Links you type as [[Note name]] appear here automatically.
              </Text>
            </View>
          ) : edges.map((edge) => {
            const outgoing = edge.source_document_id === documentId;
            const relatedId = outgoing
              ? edge.target_document_id
              : edge.source_document_id;
            return (
              <View key={edge.id} style={styles.edgeRow}>
                <Text style={styles.edgeDirection}>{outgoing ? "→" : "←"}</Text>
                <View style={styles.edgeCopy}>
                  <Text numberOfLines={1} style={styles.edgeTitle}>
                    {noteName(relatedId, edge.target_ref)}
                  </Text>
                  <Text style={styles.edgeRelation}>
                    {edge.relation.replaceAll("_", " ")}
                  </Text>
                </View>
              </View>
            );
          })}

          <Text style={styles.guardrail}>
            Nemesis never silently deletes or merges your writing. Applied
            connections are logged and can be safely undone.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: space(3),
      paddingBottom: space(3),
      paddingHorizontal: space(4),
    },
    backButton: {
      alignItems: "center",
      borderRadius: control.lg / 2,
      height: control.lg,
      justifyContent: "center",
      overflow: "hidden",
      width: control.lg,
    },
    backGlyph: { color: c.text, fontSize: 28, lineHeight: 30, marginTop: -2 },
    headerCopy: { alignItems: "center", flex: 1, minWidth: 0 },
    eyebrow: {
      ...type.micro,
      color: c.accent,
      fontWeight: "600",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    title: { ...type.title, color: c.text, marginTop: 2, maxWidth: "100%" },
    headerSpacer: { width: control.lg },
    loading: { gap: space(3), padding: space(5) },
    skeletonCard: { borderRadius: radius.lg, marginTop: space(2) },
    empty: { alignItems: "center", flex: 1, justifyContent: "center", padding: space(6) },
    content: { paddingHorizontal: space(5), paddingTop: space(3) },
    intro: { ...type.body, color: c.text2, lineHeight: 23, marginBottom: space(6) },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: space(2),
      marginTop: space(5),
    },
    sectionTitle: { ...type.title, color: c.text },
    sectionCount: { ...type.small, color: c.text3, fontVariant: ["tabular-nums"] },
    card: {
      backgroundColor: c.surface,
      borderColor: c.line,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: space(3),
      marginBottom: space(3),
      padding: space(4),
    },
    cardTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: space(2),
      justifyContent: "space-between",
    },
    cardTitle: { ...type.body, color: c.text, flex: 1, fontWeight: "600" },
    relationPill: {
      backgroundColor: c.accentFaint,
      borderRadius: radius.pill,
      paddingHorizontal: space(2),
      paddingVertical: 4,
    },
    relationText: {
      ...type.micro,
      color: c.accent,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    reason: { ...type.small, color: c.text2, lineHeight: 19 },
    actions: { flexDirection: "row", gap: space(2) },
    primaryAction: {
      alignItems: "center",
      backgroundColor: c.accent,
      borderRadius: radius.md,
      justifyContent: "center",
      minHeight: control.md,
      paddingHorizontal: space(3),
    },
    primaryLabel: { ...type.small, color: c.onAccent, fontWeight: "600" },
    quietAction: {
      alignItems: "center",
      borderRadius: radius.md,
      justifyContent: "center",
      minHeight: control.md,
      paddingHorizontal: space(3),
    },
    quietLabel: { ...type.small, color: c.text2, fontWeight: "600" },
    actionPressed: { opacity: 0.72 },
    disabled: { opacity: 0.48 },
    organizeButton: {
      alignItems: "center",
      backgroundColor: c.surface2,
      borderColor: c.line,
      borderRadius: radius.lg,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: control.lg,
      marginTop: space(1),
    },
    organizeLabel: { ...type.body, color: c.text, fontWeight: "600" },
    message: { ...type.small, color: c.text2, marginTop: space(2), textAlign: "center" },
    emptyCard: {
      backgroundColor: c.surface,
      borderColor: c.line,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: space(4),
    },
    emptyText: { ...type.small, color: c.text3, lineHeight: 19 },
    edgeRow: {
      alignItems: "center",
      borderBottomColor: c.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: space(3),
      minHeight: 58,
      paddingVertical: space(2),
    },
    edgeDirection: { color: c.accent, fontSize: 20, width: 22 },
    edgeCopy: { flex: 1, minWidth: 0 },
    edgeTitle: { ...type.body, color: c.text },
    edgeRelation: {
      ...type.micro,
      color: c.text3,
      marginTop: 2,
      textTransform: "capitalize",
    },
    guardrail: {
      ...type.micro,
      color: c.text3,
      lineHeight: 16,
      marginTop: space(6),
      textAlign: "center",
    },
  });
