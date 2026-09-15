import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { useNx } from "@/theme/nx";
import { themeLabel, useNxAppearance } from "@/components/nx/settings/appearance-store";
import {
  Avatar,
  Chev,
  Group,
  GroupRow,
  IconBox,
  NavTrail,
  SettingsHeader,
  SUPPORT_EMAIL,
  SUPPORT_URL,
  usePlan,
  useSettingsProfile,
} from "@/components/nx/settings/kit";

// Settings, the root of the settings stack (canvas artboard "Settings"). Still presented as a
// modal by the root Stack; every row pushes a settings-* route over it.

const go = (path: string) => router.push(path as never);

export default function SettingsScreen() {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { session, name, email, initial } = useSettingsProfile();
  const plan = usePlan();
  const { theme } = useNxAppearance();

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <SettingsHeader title="Settings" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
          <Text testID="profile-guest" style={{ color: c.t2, fontSize: 16 }}>You're not signed in.</Text>
          <Pressable
            testID="goto-signin"
            onPress={() => router.replace("/sign-in")}
            style={{ height: 50, paddingHorizontal: 32, borderRadius: 10, backgroundColor: c.inv, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: c.onInv, fontSize: 16, fontWeight: "500" }}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const doSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="tab-profile">
      <SettingsHeader title="Settings" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Group style={{ marginTop: 14 }}>
          <GroupRow
            minHeight={72}
            lead={<Avatar initial={initial} size={44} fontSize={17} />}
            title={name}
            meta={email}
            trail={<Chev />}
            onPress={() => go("/settings-account")}
          />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="user" />} title="Account" trail={<NavTrail />} onPress={() => go("/settings-account")} />
          <GroupRow
            lead={<IconBox icon="star" />}
            title="Subscription"
            trail={<NavTrail value={plan.label} />}
            onPress={() => go(plan.paid ? "/settings-account" : "/settings-upgrade")}
          />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="palette" />} title="Appearance" trail={<NavTrail value={themeLabel(theme)} />} onPress={() => go("/settings-appearance")} />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="link" />} title="Connected AI and apps" trail={<NavTrail />} onPress={() => go("/settings-connected")} />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="book" />} title="Study and recording" trail={<NavTrail />} onPress={() => go("/settings-study")} />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="help" />} title="Help center" trail={<NavTrail />} onPress={() => void WebBrowser.openBrowserAsync(SUPPORT_URL).catch(() => null)} />
          <GroupRow
            lead={<IconBox icon="comment" />}
            title="Send feedback"
            trail={<NavTrail />}
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Nemesis%20feedback`).catch(() => {})}
          />
        </Group>

        <Group style={{ marginTop: 18 }}>
          <GroupRow lead={<IconBox icon="logout" />} title="Sign out" onPress={() => void doSignOut()} />
        </Group>

        <Text style={{ paddingTop: 16, fontSize: 12, color: c.t3, textAlign: "center" }}>
          {/* Major and minor only, like the canvas ("Nemesis 1.0"). */}
          Nemesis {(Constants.expoConfig?.version ?? "").split(".").slice(0, 2).join(".")}
        </Text>
      </ScrollView>
    </View>
  );
}
