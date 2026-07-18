import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
import { decryptLibrary, loadCachedRows, loadVaultKey, pullLibraryRows } from "@/api/librarySync";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { useShellPadding } from "@/components/shell-chrome";
import { buildNoteGraph, layoutNoteGraph, type NoteGraph } from "@/lib/note-graph";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// Graph — the phone's twin of the desktop Graph page, rebuilt for read-only sync.
// Nodes are the synced library notes; an edge is a [[wikilink]] mention between two
// of them. Everything renders from the local cache (offline-friendly, zero tokens):
// decrypt → buildNoteGraph → deterministic force layout → one SVG. The desktop's 3D
// scene stays a desktop luxury — a 2D constellation is the right weight for a phone.
// Tap a node to open the note.

const HEADER_H = 34;

type Status = "loading" | "unpaired" | "empty" | "ready";

export default function GraphScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const { contentTop, contentBottom } = useShellPadding();
  const win = useWindowDimensions();
  const [status, setStatus] = useState<Status>("loading");
  const [graph, setGraph] = useState<NoteGraph | null>(null);

  const canvasW = win.width;
  const canvasH = Math.max(220, win.height - contentTop - contentBottom - HEADER_H);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const key = await loadVaultKey();
        if (!alive) return;
        if (!key) {
          setStatus("unpaired");
          return;
        }
        let cache = await loadCachedRows();
        if (Object.keys(cache).length === 0) {
          // First visit before the Library tab ever pulled: try one network pull,
          // but stay graceful offline — an empty graph is a state, not an error.
          try {
            cache = await pullLibraryRows(cache);
          } catch {
            // offline: render from whatever the cache holds
          }
        }
        if (!alive) return;
        const notes = decryptLibrary(cache, key)
          .docs.filter((d) => d.kind === "note")
          .map((d) => ({ content: d.content, path: d.path, pathHash: d.pathHash, title: d.title }));
        if (notes.length === 0) {
          setStatus("empty");
          setGraph(null);
          return;
        }
        const built = buildNoteGraph(notes);
        setGraph(layoutNoteGraph(built, { height: canvasH, padding: 30, width: canvasW }));
        setStatus("ready");
      })();
      return () => {
        alive = false;
      };
    }, [canvasW, canvasH]),
  );

  const showAllLabels = (graph?.nodes.length ?? 0) <= 40;

  return (
    <View
      style={[styles.flex, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
      testID="graph-screen"
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Graph</Text>
        {status === "ready" && graph ? (
          <Text style={styles.headerMeta}>
            {graph.nodes.length} notes · {graph.edges.length} connections
          </Text>
        ) : null}
      </View>

      {status === "loading" ? (
        <View style={styles.centered} testID="graph-loading">
          <ActivityIndicator color={c.text2} />
        </View>
      ) : status === "unpaired" ? (
        <View style={styles.centered}>
          <EmptyBlock
            title="Pair with your Mac"
            body="The graph is drawn from your synced library. Pair this phone and your notes — and the links between them — appear here."
          />
          <View style={styles.pairBtn}>
            <MissionButton label="Pair with your Mac" variant="primary" onPress={() => router.push("/pair")} />
          </View>
        </View>
      ) : status === "empty" ? (
        <View style={styles.centered}>
          <EmptyBlock
            title="No notes to map yet"
            body="As Nemesis writes notes into your library on the Mac, the connections between them draw themselves here."
          />
        </View>
      ) : graph ? (
        <Svg width={canvasW} height={canvasH} testID="graph-canvas">
          {graph.edges.map((edge, i) => {
            const a = graph.nodes[edge.a];
            const b = graph.nodes[edge.b];
            return <Line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c.lineMuted} strokeWidth={1} />;
          })}
          {graph.nodes.map((node) => {
            const r = 3.5 + Math.min(5, node.degree * 1.1);
            const hub = node.degree >= 3;
            const label = node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title;
            const open = () => router.push({ params: { ph: node.pathHash }, pathname: "/note" });
            return (
              <G key={node.pathHash}>
                {hub ? <Circle cx={node.x} cy={node.y} r={r + 5} fill={c.accentFaint} /> : null}
                <Circle cx={node.x} cy={node.y} r={r} fill={hub ? c.accent : c.text3} />
                {showAllLabels || node.degree >= 2 ? (
                  <SvgText
                    x={node.x}
                    y={node.y + r + 11}
                    fontSize={9}
                    fill={c.text2}
                    textAnchor="middle"
                  >
                    {label}
                  </SvgText>
                ) : null}
                {/* Generous invisible tap target on top of everything for this node. */}
                <Circle cx={node.x} cy={node.y} r={Math.max(16, r + 8)} fill="transparent" onPress={open} />
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    headerRow: {
      height: HEADER_H,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
    },
    headerTitle: { ...type.h2, color: c.text },
    headerMeta: { ...type.micro, color: c.text3 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    pairBtn: { paddingBottom: space(4), paddingHorizontal: space(8), alignSelf: "stretch" },
  });
