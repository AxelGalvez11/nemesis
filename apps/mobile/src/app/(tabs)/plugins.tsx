import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useShell } from "@/components/AppDrawer";
import { useShellPadding } from "@/components/shell-chrome";
import { CalendarIcon, FileIcon, type IconProps } from "@/components/icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Plugins — a straight port of the web app's Plugins page (apps/web/components/
// workspace/plugins/plugins-workspace.tsx). That page is purely informational:
// a hardcoded PLUGINS list of the tools Nemesis can use, each with a fixed
// status label ("Connected" / "Built in" / "Coming soon"). There is no backing
// Supabase table, API route, or edge function named "plugin" anywhere in the
// repo, and no localStorage key either — the web page renders the same four
// cards for every visitor, always. This screen mirrors that exactly: no
// fetch, no auth gate (nothing here is user-specific, so a guest sees the
// same thing a signed-in student does — same as the web, which has no auth
// check of its own), and no toggle state. If Plugins ever grows real
// enable/disable state, that state needs to land on the web page FIRST; this
// screen would then need a matching read (and write, if it's phone-editable)
// wired to wherever that state lives — deliberately not guessed at here.
//
// Web's grid collapses to a single column below its `md` breakpoint
// (`max-md:grid-cols-1`), which is every phone width — so the phone-sized
// port is just that single column, stacked top to bottom.

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

  // Drive the TopBar's centered label (same slot Library/Study/Chat use); clear
  // it on unmount so the title never leaks onto another screen.
  useEffect(() => {
    setHeaderTitle("Plugins");
    return () => setHeaderTitle(null);
  }, [setHeaderTitle]);

  return (
    <ScrollView
      style={styles.flex}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.body, { paddingTop: contentTop + space(2), paddingBottom: contentBottom }]}
      testID="plugins-screen"
    >
      <Text style={styles.subtitle}>Connect the tools Nemesis can use while you study and research.</Text>

      <View style={styles.cards}>
        {PLUGINS.map((plugin) => (
          <View key={plugin.id} style={styles.card} testID={`plugin-card-${plugin.id}`}>
            <View style={styles.cardHead}>
              <View style={styles.iconSwatch}>
                <PluginGlyph icon={plugin.icon} color={c.text2} />
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{plugin.status}</Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{plugin.name}</Text>
            <Text style={styles.cardBody}>{plugin.description}</Text>
            {plugin.status === "Coming soon" ? (
              <Pressable
                disabled
                onPress={() => {}}
                style={styles.unavailableBtn}
                accessibilityRole="button"
                accessibilityLabel="Unavailable"
                accessibilityState={{ disabled: true }}
                testID={`plugin-unavailable-${plugin.id}`}
              >
                <Text style={styles.unavailableText}>Unavailable</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function PluginGlyph({ icon, color }: { icon: PluginIconKey; color: string }) {
  switch (icon) {
    case "files":
      return <FileIcon size={17} color={color} strokeWidth={1.7} />;
    case "calendar":
      return <CalendarIcon size={17} color={color} strokeWidth={1.7} />;
    case "organization":
      return <InstitutionIcon size={17} color={color} />;
    case "globe":
    default:
      return <GlobeIcon size={17} color={color} />;
  }
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
    subtitle: { ...type.small, color: c.text2, marginBottom: space(4) },

    cards: { gap: space(3) },
    card: {
      minHeight: 132,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      padding: space(4),
    },
    cardHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: space(3),
    },
    iconSwatch: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    statusPill: { paddingHorizontal: space(2), paddingVertical: space(1), borderRadius: radius.pill, backgroundColor: c.raised },
    statusText: { ...type.micro, color: c.text3 },

    cardTitle: { ...type.bodyStrong, color: c.text },
    cardBody: { ...type.small, color: c.text2, marginTop: space(1) },

    unavailableBtn: {
      alignSelf: "flex-start",
      marginTop: space(3),
      paddingHorizontal: space(3),
      paddingVertical: space(1.5),
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      // The chip reads "disabled" through its own muted fill, NOT by fading the
      // label — owner 2026-07-22 wants text at full strength everywhere.
      backgroundColor: c.surface2,
    },
    unavailableText: { ...type.micro, color: c.text2 },
  });
