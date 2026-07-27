// Deno unit tests (repo convention) for the FluidAudio Podfile pin.
// Run: deno test --no-check --allow-read apps/mobile/plugins/withFluidAudioPod.test.ts
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { addFluidAudioPod, FLUID_AUDIO_TAG } = require("./withFluidAudioPod.js");

// Shaped like the Podfile Expo actually generates.
const PODFILE = `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")

platform :ios, podfile_properties['ios.deploymentTarget'] || '17.0'

target 'Nemesis' do
  use_expo_modules!
  config = use_native_modules!
end
`;

Deno.test("the pin lands inside the target block, not at the file root", () => {
  const out = addFluidAudioPod(PODFILE);
  const podLine = out.split("\n").findIndex((l) => l.includes("pod 'FluidAudio'"));
  const target = out.split("\n").findIndex((l) => l.includes("target 'Nemesis'"));
  const close = out.split("\n").findIndex((l) => l.trim() === "end");
  assert(podLine > target, "pod must come after the target opens");
  assert(podLine < close, "pod must come before the target closes");
});

Deno.test("it pins an exact tag — a floating ref would silently change the ABI", () => {
  const out = addFluidAudioPod(PODFILE);
  assert(out.includes(`:tag => '${FLUID_AUDIO_TAG}'`), "tag missing");
  assert(out.includes("FluidInference/FluidAudio.git"), "git source missing");
});

Deno.test("0.15.5 is the pinned tag — older tags predate the streaming API", () => {
  // The published CocoaPods trunk version (0.7.8) has no StreamingAsrManager,
  // which is the whole reason this plugin exists.
  assertEquals(FLUID_AUDIO_TAG, "v0.15.5");
});

Deno.test("running twice does not add the pod twice", () => {
  const once = addFluidAudioPod(PODFILE);
  const twice = addFluidAudioPod(once);
  assertEquals(twice, once);
  assertEquals(twice.split("pod 'FluidAudio'").length - 1, 1);
});

Deno.test("a Podfile template change fails LOUDLY instead of building a broken app", () => {
  // Silently skipping the injection produces a build that dies at link time —
  // expensive to diagnose and easy to mistake for a Swift error.
  assertThrows(
    () => addFluidAudioPod("target 'Nemesis' do\nend\n"),
    Error,
    "use_expo_modules!",
  );
});

Deno.test("the anchor it depends on is the one Expo actually writes", () => {
  assert(PODFILE.includes("use_expo_modules!"), "test fixture drifted from reality");
});
