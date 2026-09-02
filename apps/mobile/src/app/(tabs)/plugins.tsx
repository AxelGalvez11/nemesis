import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { CalendarIcon, FileIcon, SearchIcon, type IconProps } from "@/components/icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, row, space, type } from "@/theme/tokens";

// Plugins — a straight port of the web app's Plugins page (apps/web/components/
// workspace/plugins/plugins-workspace.tsx). That page is purely informational:
// a hardcoded PLUGINS list of the tools Nemesis can use, each with a fixed
// status label ("Connected" / "Built in" / "Coming soon"). There is no backing
// Supabase table, API route, or edge function named "plugin" anywhere in the
// repo, and no localStorage key either — this screen still mirrors that
// exactly: no fetch, no auth gate, no toggle state, and — 2026-09-01
// ChatGPT-parity pass — still the SAME FOUR ENTRIES. Only the layout changed,
// against IMG_6558 (~/Downloads/chatgptios): an "Installed" row of small tiles
// for what's actually active, then a "Popular" list of full descriptive rows
// for all four (the informational content the original screen existed to
// show). No "New & Noteworthy" section: the reference's is a merchandising
// shelf for a plugin STORE Nemesis doesn't have — inventing a third bucket to
// fill would mean splitting four real entries into three sections of one,
// which reads as more content than exists. Search filters the same four.

type PluginIconKey = "globe" | "files" | "calendar" | "organization";
type PluginStatus = "Connected" | "Built in" | "Coming soon";

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  icon: PluginIconKey;
  status: PluginStatus;
}

// Verbatim copy from the web PLUGINS const — same four tools, same names,
// same descriptions, same status labels. Only the icon keys are carried over
// (web uses VS Code Codicon names; PluginGlyph below maps each to this app's
// own icon language).
const PLUGINS: PluginEntry[] = [
  {
    id: "web",
    name: "Web research",
    description: "Ground chats with Brave web search.",
    icon: "globe",
    status: "Connected",
  },
  {
    id: "files",
    name: "Files and images",
    description: "Attach study material directly to a chat, from your files or your Library.",
    icon: "files",
    status: "Connected",
  },
  {
    id: "calendar",
    name: "Calendar",
    description: "Turn study plans into scheduled review blocks and reminders.",
    icon: "calendar",
    status: "Built in",
  },
  {
    id: "lms",
    name: "Learning management system",
    description: "Import courses, assignments, and due dates from your school.",
    icon: "organization",
    status: "Coming soon",
  },
];

export default function PluginsScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { contentTop, contentBottom } = useShellPadding();
  const { setHeaderTitle } = useShell();
  const [query, setQuery] = useState("");

  // This screen draws its own centered title (with the reference's small
  // ⌄) below the shared TopBar rather than using its header-title slot, so a
  // dropdown glyph can sit right next to the word — the shared slot only
  // ever renders plain text.
  useEffect(() => {
    setHeaderTitle(null);
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  const trimmed = query.trim().toLowerCase();
  const visible = trimmed
    ? PLUGINS.filter((p) => p.name.toLowerCase().includes(trimmed) || p.description.toLowerCase().includes(trimmed))
    : PLUGINS;
  const installed = visible.filter((p) => p.status !== "Coming soon");

  return (
    <View style={styles.flex} testID="plugins-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingTop: contentTop + space(2), paddingBottom: contentBottom + 72 }]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Plugins</Text>
          <Text style={styles.titleChevron}>⌄</Text>
        </View>

        {installed.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Installed</Text>
            <View style={styles.installedRow}>
              {installed.map((plugin) => (
                <View key={plugin.id} style={styles.tile} testID={`plugin-tile-${plugin.id}`}>
                  <PluginGlyph icon={plugin.icon} color={c.text2} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Popular</Text>
        <View style={styles.cards}>
          {visible.map((plugin) => (
            <View key={plugin.id} style={styles.row} testID={`plugin-card-${plugin.id}`}>
              <View style={styles.logoTile}>
                <PluginGlyph icon={plugin.icon} color={c.text2} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.cardTitle} numberOfLines={1}>{plugin.name}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{plugin.description}</Text>
              </View>
              {plugin.status === "Coming soon" ? (
                <Text style={styles.plusGlyph} accessibilityLabel="Unavailable">+</Text>
              ) : (
                <DotsGlyph color={c.text3} />
              )}
            </View>
          ))}
          {visible.length === 0 ? <Text style={styles.emptyText}>No plugins match "{query.trim()}".</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.searchDock, { paddingBottom: contentBottom }]}>
        <View style={styles.searchField}>
          <SearchIcon size={16} color={c.text3} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search plugins"
            placeholderTextColor={c.textHint}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="plugins-search-input"
          />
        </View>
      </View>
    </View>
  );
}

function PluginGlyph({ icon, color }: { icon: PluginIconKey; color: string }) {
  switch (icon) {
    case "files":
      return <FileIcon size={19} color={color} strokeWidth={1.7} />;
    case "calendar":
      return <CalendarIcon size={19} color={color} strokeWidth={1.7} />;
    case "organization":
      return <InstitutionIcon size={19} color={color} />;
    case "globe":
    default:
      return <GlobeIcon size={19} color={color} />;
  }
}

/** The row's trailing "…", same three-dot glyph most screens in this app
 *  re-declare locally rather than share (see icons-settings.tsx's own DotsIcon
 *  doc comment) — this one is sized for a 66pt info row, not a header button,
 *  so it stays local instead of importing the 20px default. */
function DotsGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.9" fill={color} />
      <Circle cx="12" cy="12" r="1.9" fill={color} />
      <Circle cx="18.4" cy="12" r="1.9" fill={color} />
    </Svg>
  );
}

// Local glyphs the shared icon set (components/icons.tsx) doesn't carry yet —
// kept in this file rather than added there, same precedent as settings.tsx
// ("Kept local to this file ... to stay inside this task's owned-files
// boundary ... several other agents are editing the mobile tree
// concurrently"). Same hand-drawn language as icons.tsx: thin strokes, round
// caps, color from the caller.
const glyphBase = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Globe — circle, equator line, vertical meridian lens. */
function GlobeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="3.8" y1="12" x2="20.2" y2="12" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Path
        d="M12 3.8a12.55 12.55 0 0 1 3.28 8.2 12.55 12.55 0 0 1-3.28 8.2 12.55 12.55 0 0 1-3.28-8.2 12.55 12.55 0 0 1 3.28-8.2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...glyphBase}
      />
    </Svg>
  );
}

/** School/institution — roofline + columns, for the LMS card. */
function InstitutionIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9.6 12 4.2l8 5.4" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="4" y1="9.6" x2="20" y2="9.6" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="3.4" y1="19.8" x2="20.6" y2="19.8" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="8" y1="9.6" x2="8" y2="17.8" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="12" y1="9.6" x2="12" y2="17.8" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
      <Line x1="16" y1="9.6" x2="16" y2="17.8" stroke={color} strokeWidth={strokeWidth} {...glyphBase} />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    body: { paddingHorizontal: space(4), flexGrow: 1 },

    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(1), marginBottom: space(4) },
    title: { ...type.title, color: c.text },
    // A small dropdown mark next to the title (IMG_6558) — decorative today,
    // same as the reference's own (it opens no menu there either in this
    // screen's scope).
    titleChevron: { fontSize: 13, color: c.text3, marginTop: 2 },

    sectionLabel: { ...type.small, color: c.text3, fontWeight: "500", marginTop: space(3), marginBottom: space(2.5) },

    installedRow: { flexDirection: "row", flexWrap: "wrap", gap: space(3), marginBottom: space(1) },
    tile: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },

    cards: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(3.5), minHeight: row.twoLine },
    logoTile: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1 },
    cardTitle: { ...type.label, color: c.text },
    cardBody: { ...type.micro, color: c.text2, marginTop: 1 },
    plusGlyph: { fontSize: 20, color: c.text3, fontWeight: "300" },
    emptyText: { ...type.small, color: c.text2, textAlign: "center", padding: space(5) },

    searchDock: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space(4), paddingTop: space(2) },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      backgroundColor: c.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: space(4),
      height: 44,
    },
    searchInput: { flex: 1, ...type.label, color: c.text, paddingVertical: 0 },
  });
