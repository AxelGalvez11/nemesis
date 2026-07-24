const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Pins FluidAudio to a git tag in the generated Podfile.
//
// Why this exists: NemesisAsr needs FluidAudio 0.15.5 (the first version with
// the streaming Parakeet API), but the CocoaPods trunk only publishes 0.7.8.
// A podspec's `s.dependency` can only resolve from a source CocoaPods knows
// about, so the git pin has to be declared in the Podfile itself.
//
// The alternative — an spm_dependency inside the podspec — is what failed
// build 20: a Swift Package in a statically-linked CocoaPods workspace breaks
// the target dependency graph for every pod, not just this one.

const FLUID_AUDIO_TAG = "v0.15.5";
const POD_LINE = `  pod 'FluidAudio', :git => 'https://github.com/FluidInference/FluidAudio.git', :tag => '${FLUID_AUDIO_TAG}'`;

// Expo writes this into every app target; it is the stable place to anchor to.
const ANCHOR = "use_expo_modules!";

function addFluidAudioPod(contents) {
  if (contents.includes("pod 'FluidAudio'")) return contents;

  if (!contents.includes(ANCHOR)) {
    // Fail loudly. A silently-skipped injection produces a build that gets all
    // the way to linking before dying on a missing module, which is expensive
    // to diagnose and easy to mistake for a code error.
    throw new Error(
      `withFluidAudioPod: could not find "${ANCHOR}" in the Podfile, so the ` +
        `FluidAudio git pin was not applied. The Podfile template changed — ` +
        `update the anchor before building.`,
    );
  }

  return contents.replace(ANCHOR, `${ANCHOR}\n${POD_LINE}`);
}

module.exports = function withFluidAudioPod(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(podfile, addFluidAudioPod(fs.readFileSync(podfile, "utf8")));
      return cfg;
    },
  ]);
};

// Exported for the unit test — the injection is pure string work, so it can be
// verified without running a prebuild.
module.exports.addFluidAudioPod = addFluidAudioPod;
module.exports.FLUID_AUDIO_TAG = FLUID_AUDIO_TAG;
