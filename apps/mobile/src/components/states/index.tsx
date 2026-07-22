import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The doc-06 8-state matrix as reusable primitives. Screens compose these so every
// state (load/empty/error/no-source/outdated/paywall/guest/offline) has one source
// of truth. Empty-state copy that doc-06 specifies verbatim is passed in by the
// screen (e.g. the Watchlist empty copy). Colors come from the live theme
// (useTheme), not the legacy static tokens — this file's one live consumer
// (profile/delete-account.tsx's ErrorState) must follow light/dark mode.

function StateBox({
  testID,
  title,
  body,
  children,
}: {
  testID: string;
  title?: string;
  body?: string;
  children?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.box} testID={testID}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function LoadingState({ testID = "state-loading" }: { testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.box} testID={testID}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  body,
  testID = "state-empty",
}: {
  title?: string;
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title={title} body={body} />;
}

export function ErrorState({
  body = "Something went wrong. Pull to retry.",
  testID = "state-error",
}: {
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title="Error" body={body} />;
}

export function NoSourceState({
  body = "No FDA/DailyMed source was found for this item.",
  testID = "state-no-source",
}: {
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title="No source found" body={body} />;
}

export function OutdatedState({
  body = "This information may be outdated. A newer version may exist.",
  testID = "state-outdated",
}: {
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title="Possibly outdated" body={body} />;
}

export function PaywallState({
  body = "Upgrade to Pro to follow more than 3 items.",
  testID = "state-paywall",
}: {
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title="Pro feature" body={body} />;
}

export function GuestState({
  body = "Sign in to use this feature.",
  testID = "state-guest",
  children,
}: {
  body?: string;
  testID?: string;
  children?: ReactNode;
}) {
  return (
    <StateBox testID={testID} title="Browsing as guest" body={body}>
      {children}
    </StateBox>
  );
}

export function OfflineState({
  body = "You're offline. Showing cached data where available.",
  testID = "state-offline",
}: {
  body?: string;
  testID?: string;
}) {
  return <StateBox testID={testID} title="Offline" body={body} />;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(2) },
    title: { ...type.h2, color: c.text, textAlign: "center" },
    body: { ...type.small, color: c.text2, textAlign: "center", maxWidth: 360 },
  });
