import { Pressable, StyleSheet, Text, View } from "react-native";
import { ForceSlider } from "@/components/ForceSlider";
import type { GraphMode, LabelMode } from "@/lib/graph-settings";
import { LABEL_MODES } from "@/lib/graph-settings";
import type { ThemeColors } from "@/theme/palette";
import { radius, space, type } from "@/theme/tokens";

// The Graph screen's floating settings panel — extracted from graph.tsx so
// that file stays focused on data/physics/gesture orchestration (see its
// top-of-file comment for why the panel is a FLOATING overlay, not in-flow).
//
// Mirrors the web Graph's controls-panel.tsx: a mode toggle (2D | 3D — the
// web version keeps this same segmented-button shape at the top of its own
// panel) plus the same handful of sliders web exposes, translated to what's
// cheap on a phone screen:
//   - Node size, Gravity, Repulsion, Link distance/Spread — direct 1:1 ports
//     (graph.tsx's existing ForceSlider rows), present in both modes.
//   - Rotation speed — 3D-only (auto-orbit strength), shown only when
//     mode==="3d".
//   - Labels — kept as the existing All/Hubs/None 3-way segment rather than
//     web's separate boolean "Node names" switch + numeric "Label size"
//     slider: two more controls would crowd a panel this narrow, and the
//     3-way already covers the same "how many labels" question web's
//     boolean covers, plus a phone-sized "just hubs" middle ground web
//     doesn't have. Label SIZE (a pure font-size multiplier) is skipped —
//     see graph.tsx's top-of-file comment for the full list of skips.
//   - Neighbor glow (web: dim non-adjacent nodes on mouse HOVER) is skipped
//     entirely — there is no persistent hover on a touchscreen, and
//     reinterpreting it as tap-to-preview would fight the existing
//     tap-opens-the-note contract (see GraphNodeView.tsx).

interface GraphSettingsPanelProps {
  c: ThemeColors;
  top: number;
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
  gravity: number;
  onGravityChange: (value: number) => void;
  repulsion: number;
  onRepulsionChange: (value: number) => void;
  nodeSize: number;
  onNodeSizeChange: (value: number) => void;
  linkDistance: number;
  onLinkDistanceChange: (value: number) => void;
  rotationSpeed: number;
  onRotationSpeedChange: (value: number) => void;
  labelMode: LabelMode;
  onLabelModeChange: (mode: LabelMode) => void;
  onReset: () => void;
}

const MODES: { id: GraphMode; label: string }[] = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

export function GraphSettingsPanel({
  c,
  top,
  mode,
  onModeChange,
  gravity,
  onGravityChange,
  repulsion,
  onRepulsionChange,
  nodeSize,
  onNodeSizeChange,
  linkDistance,
  onLinkDistanceChange,
  rotationSpeed,
  onRotationSpeedChange,
  labelMode,
  onLabelModeChange,
  onReset,
}: GraphSettingsPanelProps) {
  const styles = panelStyles(c);
  return (
    <View style={[styles.panel, { top }]} testID="graph-settings-panel">
      <View style={styles.labelsRow}>
        <Text style={styles.panelLabel}>Mode</Text>
        <View style={styles.segment} testID="graph-mode-toggle">
          {MODES.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => onModeChange(entry.id)}
              style={[styles.segmentItem, mode === entry.id && styles.segmentItemActive]}
              testID={`graph-mode-${entry.id}`}
            >
              <Text style={[styles.segmentText, mode === entry.id && styles.segmentTextActive]}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ForceSlider c={c} label="Gravity" max={3} min={0} onChange={onGravityChange} step={0.1} value={gravity} />
      <ForceSlider c={c} label="Repulsion" max={4} min={0.2} onChange={onRepulsionChange} step={0.1} value={repulsion} />
      <ForceSlider c={c} label="Node size" max={2} min={0.5} onChange={onNodeSizeChange} step={0.1} value={nodeSize} />
      <ForceSlider
        c={c}
        label={mode === "3d" ? "Spread" : "Link distance"}
        max={2}
        min={0.5}
        onChange={onLinkDistanceChange}
        step={0.1}
        value={linkDistance}
      />
      {mode === "3d" ? (
        <ForceSlider c={c} label="Rotation speed" max={3} min={0} onChange={onRotationSpeedChange} step={0.2} value={rotationSpeed} />
      ) : null}

      <View style={styles.labelsRow}>
        <Text style={styles.panelLabel}>Labels</Text>
        <View style={styles.segment} testID="graph-label-mode">
          {LABEL_MODES.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => onLabelModeChange(entry.id)}
              style={[styles.segmentItem, labelMode === entry.id && styles.segmentItemActive]}
              testID={`graph-label-mode-${entry.id}`}
            >
              <Text style={[styles.segmentText, labelMode === entry.id && styles.segmentTextActive]}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetBtn} testID="graph-settings-reset">
        <Text style={styles.resetBtnText}>Reset to defaults</Text>
      </Pressable>
    </View>
  );
}

const panelStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Same FLOATING-overlay shape as before this was extracted from
    // graph.tsx — opaque so it fully occludes the canvas beneath it, and on
    // top in paint order so its own Pressables/ForceSliders always receive
    // the touch instead of the canvas underneath.
    panel: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 50,
      elevation: 20,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      paddingHorizontal: space(4),
      paddingTop: space(3),
      paddingBottom: space(3),
      gap: space(3),
    },
    labelsRow: { gap: space(1.5) },
    panelLabel: { ...type.micro, color: c.text2 },
    segment: { flexDirection: "row", backgroundColor: c.surface2, borderRadius: radius.sm, padding: 3, gap: 3 },
    segmentItem: { flex: 1, paddingVertical: space(1.5), alignItems: "center", borderRadius: radius.sm - 2 },
    segmentItemActive: { backgroundColor: c.accentFaint },
    segmentText: { ...type.micro, color: c.text2, fontWeight: "600" },
    segmentTextActive: { color: c.accent },
    resetBtn: {
      alignSelf: "flex-start",
      paddingVertical: space(1.5),
      paddingHorizontal: space(3),
      borderRadius: radius.sm,
      backgroundColor: c.surface2,
    },
    resetBtnText: { ...type.micro, color: c.text2, fontWeight: "600" },
  });
