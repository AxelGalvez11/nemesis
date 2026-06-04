import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// The doc-06 8-state matrix as reusable primitives. Screens compose these so every
// state (load/empty/error/no-source/outdated/paywall/guest/offline) has one source
// of truth. Empty-state copy that doc-06 specifies verbatim is passed in by the
// screen (e.g. the Watchlist empty copy).

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
  return (
    <View style={styles.box} testID={testID}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function LoadingState({ testID = "state-loading" }: { testID?: string }) {
  return (
    <View style={styles.box} testID={testID}>
      <ActivityIndicator />
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

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 14, opacity: 0.75, textAlign: "center", maxWidth: 360 },
});
