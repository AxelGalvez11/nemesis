import { Text, View } from "react-native";
import { common } from "@/theme/common";

// Explore tab (stub). Search → results → drug page + Source Viewer land in 6b-2.
export default function ExploreTab() {
  return (
    <View style={common.screen} testID="tab-explore">
      <Text style={common.h1}>Explore</Text>
      <Text style={common.body}>
        Search drugs, peptides, and supplements — full Explore + Drug page land in 6b-2.
      </Text>
    </View>
  );
}
