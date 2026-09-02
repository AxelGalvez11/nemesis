import { type ComponentType, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchEntitlements } from "@/api/billing";
import { purchasesAvailable, restorePurchases } from "@/lib/purchases";
import { planDisplayName, settingsDisplayName, settingsInitials } from "@/lib/settings-identity";
import {
  CloseIcon,
  FileIcon,
  type IconProps,
  LifeRingIcon,
  LogoutIcon,
  MailIcon,
  TrashIcon,
} from "@/components/icons";
import {
  PencilIcon,
  PluginAtIcon,
  PlusSquareIcon,
  RefreshIcon,
  SmileyIcon,
  SparkleSingleIcon,
  SunIcon,
  UsageChartIcon,
} from "@/components/icons-settings";
import { UpgradeSheet } from "@/components/UpgradeSheet";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, row, space, type } from "@/theme/tokens";

// Settings — presented as a bottom-sheet MODAL (owner call 2026-07-17, matching
// the ChatGPT iOS app: it slides up from the bottom via the root Stack's
// presentation:"modal" on this route).
//
// 2026-09-01 ChatGPT-parity pass: rebuilt against IMG_6548 (~/Downloads/
// chatgptios), measured at 3x — see the crop notes on each style below. The
// page background is the grouped-table grey (c.bgGrouped), not c.bg: the
// reference's cards float on a visibly different tone from the page, which
// bgGrouped/raised already model (theme/palette.ts). Section order and rows
// mirror the reference's own three top cards ("Customize ChatGPT" -> ours is
// "Customize Nemesis", "Account", "Theme") — Memory has no phone equivalent
// yet (Nemesis has no Memory settings on this build) so that row is dropped
// rather than stubbed; everything below the fold (Legal/Support/destructive)
// is untouched Nemesis surface, just restyled onto the same card language.

const SUPPORT_EMAIL = "support@enternemesis.com";

// Not a token: tokens.ts's radius ladder (sm 8 / md 10 / lg 16 / xl 24) has no
// step near the reference's card corner, which reads visibly softer than 16
// but well short of 24 at this card's size. Measured off IMG_6548's card
// corners; a local constant, not a new global token, per this task's file
// boundary (theme/tokens.ts is off-limits this pass).
const CARD_RADIUS = 18;

// Divider inset: the reference's row separators start at the LABEL's x, not
// the card edge (measured off IMG_6548's Personalization/Plugins rows — the
// hairline begins under "P" in "Personalization", not under the smiley).
// = row's own horizontal padding + the icon column's width + its gap to the
// label, i.e. exactly where <Text> begins in the row below.
const ROW_PAD_H = space(4); // 16
const ROW_ICON_W = 24;
const ROW_ICON_GAP = space(3); // 12
const DIVIDER_INSET = ROW_PAD_H + ROW_ICON_W + ROW_ICON_GAP; // 52

// Avatar + pencil badge — measured off IMG_6548 (native px ÷ 3): the avatar
// circle is ~72pt (the task brief's "≈80pt" was a by-eye estimate; this is
// the pixel measurement), the pencil badge ~34pt, bottom-right overlapping
// the avatar's edge.
const AVATAR_SIZE = 72;
const AVATAR_BADGE_SIZE = 34;

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors: c, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const modeLabel = mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System";

  // Plan name for the Subscription row's value. Left blank (no row value) until
  // this resolves rather than defaulting to "Free" — a defaulted label that's
  // wrong for a paying student for the half-second before the real fetch lands
  // is exactly the silent-degradation shape this codebase keeps re-learning the
  // hard way (see MEMORY.md's "degraded ≠ complete"). Failures stay silent too:
  // this is a nice-to-have label, not a gate, and there is nothing actionable a
  // settings row can do with an entitlements-fetch error.
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void fetchEntitlements()
      .then((snapshot) => {
        if (alive) setPlanCode(snapshot.plan);
      })
      .catch(() => {
        // Silent — see the comment above.
      });
    return () => {
      alive = false;
    };
  }, [session]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const CloseButton = (
    <View style={[styles.modalTop, { paddingTop: insets.top + space(2) }]}>
      <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} testID="settings-close" accessibilityLabel="Close settings">
        <CloseIcon size={17} color={c.text} />
      </Pressable>
    </View>
  );

  if (!session) {
    return (
      <View style={styles.root}>
        {CloseButton}
        <View style={styles.guest}>
          <Text style={styles.guestText} testID="profile-guest">You're not signed in.</Text>
          <Pressable testID="goto-signin" style={styles.signinBtn} onPress={() => router.replace("/sign-in")}>
            <Text style={styles.signinText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const email = session.user.email ?? "";
  const metadataName = session.user.user_metadata?.full_name;
  const displayName = settingsDisplayName(typeof metadataName === "string" ? metadataName : null, email);
  const initials = settingsInitials(displayName);

  // Restore purchases: always shown (the row's own presence is App Store
  // convention wherever purchases exist — src/lib/purchases.ts's own comment:
  // "Apple requires this button anywhere purchases exist"), but the TAP is
  // honest about why it can't find anything on a build with no native module
  // (Expo Go, the simulator, Android) instead of claiming "no previous
  // purchase" — those are different facts, and only one of them is true here.
  const onRestore = () => {
    if (!purchasesAvailable()) {
      Alert.alert("Purchases aren't available in this build.");
      return;
    }
    void restorePurchases().then((plan) => {
      Alert.alert(plan ? "Purchases restored." : "No previous purchase found for this Apple ID.");
    });
  };

  return (
    <View style={styles.root}>
      {CloseButton}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}
        showsVerticalScrollIndicator={false}
        testID="tab-profile"
      >
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "N"}</Text>
            </View>
            {/* No-op for now — Nemesis has no avatar upload yet; the badge exists
                so the header reads exactly like the reference's, not to promise a
                feature that isn't there. */}
            <View style={styles.avatarBadge}>
              <PencilIcon size={14} color={c.text} />
            </View>
          </View>
          <Text style={styles.identityName} numberOfLines={1} testID="profile-name">{displayName}</Text>
        </View>

        <SectionLabel styles={styles}>Customize Nemesis</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={SmileyIcon} label="Personalization" chevron testID="nav-general" onPress={() => router.push("/profile/general")} />
          <SettingRow styles={styles} icon={PluginAtIcon} label="Plugins" chevron last testID="nav-plugins" onPress={() => router.push("/plugins")} />
        </Card>

        <SectionLabel styles={styles}>Account</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={MailIcon} label="Email" value={email} testID="nav-email" />
          <SettingRow
            styles={styles}
            icon={PlusSquareIcon}
            label="Subscription"
            value={planCode ? planDisplayName(planCode) : undefined}
            chevron
            testID="nav-subscription"
            onPress={() => router.push("/profile/subscription")}
          />
          <SettingRow styles={styles} icon={RefreshIcon} label="Restore purchases" testID="nav-restore" onPress={onRestore} />
          <SettingRow
            styles={styles}
            icon={SparkleSingleIcon}
            label="Upgrade plan"
            tint={c.blue}
            testID="nav-upgrade"
            onPress={() => setUpgradeOpen(true)}
          />
          <SettingRow styles={styles} icon={UsageChartIcon} label="Usage and limits" chevron last testID="nav-usage" onPress={() => router.push("/profile/usage")} />
        </Card>

        <SectionLabel styles={styles}>Theme</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={SunIcon} label="Appearance" value={modeLabel} chevron last testID="nav-appearance" onPress={() => router.push("/profile/appearance")} />
        </Card>

        <SectionLabel styles={styles}>Legal</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={FileIcon} label="Terms of service" chevron testID="nav-terms" onPress={() => router.push("/profile/legal?doc=terms")} />
          <SettingRow styles={styles} icon={FileIcon} label="Privacy policy" chevron last testID="nav-privacy" onPress={() => router.push("/profile/legal?doc=privacy")} />
        </Card>

        <SectionLabel styles={styles}>Support</SectionLabel>
        <Card styles={styles}>
          <SettingRow styles={styles} icon={LifeRingIcon} label="Contact support" chevron last testID="nav-support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} />
        </Card>

        <View style={{ height: space(4) }} />
        <Card styles={styles}>
          <SettingRow styles={styles} icon={TrashIcon} label="Delete account" danger chevron testID="nav-delete-account" onPress={() => router.push("/profile/delete-account")} />
          <SettingRow styles={styles} icon={LogoutIcon} label="Sign out" danger last testID="signout" onPress={signOut} />
        </Card>

        <Text style={styles.version}>Nemesis {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>

      <UpgradeSheet visible={upgradeOpen} message={null} reset={null} onClose={() => setUpgradeOpen(false)} />
    </View>
  );
}

function SectionLabel({ styles, children }: { styles: Styles; children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ styles, children }: { styles: Styles; children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SettingRow({
  styles,
  icon: Icon,
  label,
  value,
  chevron,
  danger,
  tint,
  last,
  testID,
  onPress,
}: {
  styles: Styles;
  icon: ComponentType<IconProps>;
  label: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  /** Overrides both the icon and label color — the reference's "Upgrade plan"
   *  row, which is blue end to end rather than the usual text/text3 split. */
  tint?: string;
  last?: boolean;
  testID?: string;
  onPress?: () => void;
}) {
  const { colors: c } = useTheme();
  const iconTint = danger ? c.danger : (tint ?? c.text);
  const labelColor = danger ? c.danger : (tint ?? c.text);
  return (
    <View>
      <Pressable
        testID={testID}
        disabled={!onPress}
        onPress={onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={value ? `${label}, ${value}` : label}
        style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      >
        <View style={styles.rowIcon}>
          <Icon size={20} color={iconTint} strokeWidth={1.7} />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
        {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
        {chevron ? <Text style={styles.chevron}>›</Text> : null}
      </Pressable>
      {/* Inset to the label's x (DIVIDER_INSET), not the card edge — see that
          constant's comment. Omitted on the card's last row, same as before. */}
      {!last ? <View style={styles.divider} /> : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bgGrouped },
    modalTop: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space(4), paddingBottom: space(1) },
    closeBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      backgroundColor: c.raised,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },

    guest: { flex: 1, alignItems: "center", justifyContent: "center", gap: space(4), padding: space(6) },
    guestText: { color: c.text2, fontSize: type.small.fontSize + 1 },
    signinBtn: { backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(8) },
    signinText: { color: c.onAccent, fontSize: type.small.fontSize + 1, fontWeight: "600" },

    body: { paddingHorizontal: space(4), flexGrow: 1 },

    identity: { alignItems: "center", paddingHorizontal: space(4), paddingBottom: space(5), gap: space(1.5) },
    avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, marginBottom: space(1) },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 26, fontWeight: "600", color: c.onAccent },
    avatarBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: AVATAR_BADGE_SIZE,
      height: AVATAR_BADGE_SIZE,
      borderRadius: AVATAR_BADGE_SIZE / 2,
      backgroundColor: c.raised,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    identityName: { ...type.title, color: c.text },

    // 15pt grey, sentence case — NOT the old uppercase/letterspaced treatment;
    // the reference's "Customize ChatGPT" / "Account" / "Theme" labels are
    // plain sentence case at the row's own type scale.
    sectionLabel: {
      color: c.text3,
      fontSize: type.small.fontSize,
      fontWeight: "500",
      marginTop: space(5),
      marginBottom: space(2),
      marginLeft: space(2),
    },
    card: {
      backgroundColor: c.raised,
      borderRadius: CARD_RADIUS,
      overflow: "hidden",
    },

    row: { flexDirection: "row", alignItems: "center", gap: ROW_ICON_GAP, paddingHorizontal: ROW_PAD_H, minHeight: row.settings },
    rowPressed: { backgroundColor: c.surface2 },
    rowIcon: { width: ROW_ICON_W, alignItems: "center", justifyContent: "center" },
    rowLabel: { flex: 1, fontSize: type.label.fontSize, color: c.text },
    rowValue: { fontSize: type.label.fontSize, color: c.text3, marginLeft: space(2) },
    chevron: { fontSize: 20, color: c.text3, marginLeft: space(1) },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: DIVIDER_INSET },

    version: { fontSize: type.micro.fontSize, color: c.text3, textAlign: "center", marginTop: space(5) },
  });

type Styles = ReturnType<typeof createStyles>;
