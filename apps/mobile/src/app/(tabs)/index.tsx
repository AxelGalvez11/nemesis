import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PageNode } from "@/api/space";
import { createPage } from "@/api/spaceWrite";
import { NewMenu } from "@/components/nx/NewMenu";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxBottomBar, NxNewButton, NxRow, NxSection } from "@/components/nx/primitives";
import { useSpacePages } from "@/hooks/useSpace";
import { ago } from "@/lib/ago";
import { nxType, useNx } from "@/theme/nx";
import { iconOf } from "@/lib/fresh";

// Notes, the home tab (canvas artboard "Main"): recent pages, then every page as a tree, Notion style.
export default function NotesHome() {
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { spaceId, tree, recents, loading, error, refetch, refreshing } = useSpacePages();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState<string | null>(null);

  const newPage = async () => {
    if (!spaceId) return;
    setMaking(true);
    setMakeError(null);
    try {
      const id = await createPage(spaceId, {});
      await qc.invalidateQueries({ queryKey: ["ws-all-pages", spaceId] });
      setMenu(false);
      router.push({ pathname: "/page/[id]", params: { id, fresh: "1" } });
    } catch (e) {
      setMakeError(e instanceof Error ? e.message : "The page could not be made.");
      setMenu(false);
    } finally {
      setMaking(false);
    }
  };

  const openPage = (id: string) => router.push({ pathname: "/page/[id]", params: { id } });

  const renderNode = (node: PageNode, level: number): React.ReactNode[] => {
    const expanded = !!open[node.id];
    const rows: React.ReactNode[] = [
      <Pressable key={node.id} onPress={() => openPage(node.id)} style={({ pressed }) => [styles.tree, { paddingLeft: 6 + level * 22 }, pressed && { backgroundColor: c.soft }]}>
        <Pressable
          hitSlop={6}
          disabled={node.children.length === 0}
          onPress={() => setOpen((o) => ({ ...o, [node.id]: !o[node.id] }))}
          style={styles.chev}
          accessibilityLabel={expanded ? "Collapse" : "Expand"}
        >
          {node.children.length ? <NxIcon name={expanded ? "chev_d" : "chev_r"} size={14} color={c.t3} strokeWidth={2} /> : null}
        </Pressable>
        <Text style={styles.treeEmoji}>{iconOf(node.props.icon)}</Text>
        <Text numberOfLines={1} style={[nxType.rowTitle, { color: c.t1, flex: 1 }]}>
          {node.props.title || "Untitled"}
        </Text>
      </Pressable>,
    ];
    if (expanded) for (const child of node.children) rows.push(...renderNode(child, level + 1));
    return rows;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={c.t3} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.t3} />
        ) : error ? (
          <Text style={[styles.note, { color: c.t2 }]}>Your pages could not be loaded. Pull down to try again.</Text>
        ) : (
          <>
            {makeError ? <Text style={[styles.note, { color: c.danger }]}>{makeError}</Text> : null}
            {recents.length ? (
              <>
                <NxSection label="Recent" />
                {recents.slice(0, 4).map((p) => (
                  <NxRow
                    key={`r-${p.id}`}
                    lead={<Text style={styles.recentEmoji}>{iconOf(p.props.icon)}</Text>}
                    title={p.props.title || "Untitled"}
                    meta={ago(p.edited_at)}
                    onPress={() => openPage(p.id)}
                  />
                ))}
              </>
            ) : null}
            <NxSection label="Pages" />
            {tree.length ? tree.flatMap((n) => renderNode(n, 0)) : <Text style={[styles.note, { color: c.t2 }]}>No pages yet. Tap New to make your first page. Pages you make on the web show up here too.</Text>}
          </>
        )}
      </ScrollView>
      <NxBottomBar ask="Ask Nemesis" onAsk={() => router.push("/chat")} right={spaceId ? <NxNewButton onPress={() => setMenu(true)} /> : null} />
      <NewMenu
        visible={menu}
        busy={making}
        onClose={() => setMenu(false)}
        onNewPage={() => void newPage()}
        onRecord={() => {
          // Recording inside a note is not built yet; the chat screen's recorder is one tap away there.
          setMenu(false);
          router.push("/chat");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tree: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingRight: 16 },
  chev: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
  treeEmoji: { width: 26, fontSize: 18, textAlign: "center", marginRight: 6 },
  recentEmoji: { width: 32, fontSize: 20, textAlign: "center" },
  note: { paddingHorizontal: 20, paddingTop: 24, fontSize: 15, lineHeight: 22 },
});
