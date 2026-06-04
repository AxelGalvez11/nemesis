import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { common } from "@/theme/common";

// Profile tab (stub). Health Context, data export, and the AC10 delete/legal
// affordances land in 6b-5. For 6b-1 it carries identity + sign-out / sign-in.
export default function ProfileTab() {
  const { session, signOut } = useAuth();
  return (
    <View style={common.screen} testID="tab-profile">
      <Text style={common.h1}>Profile</Text>
      {session ? (
        <>
          <Text testID="profile-email" style={common.body}>
            {session.user.email}
          </Text>
          <Pressable testID="signout" style={common.btn} onPress={signOut}>
            <Text style={common.btnText}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text testID="profile-guest" style={common.body}>
            Browsing as guest.
          </Text>
          <Pressable
            testID="goto-signin"
            style={common.btn}
            onPress={() => router.replace("/sign-in")}
          >
            <Text style={common.btnText}>Sign in</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
