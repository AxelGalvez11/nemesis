# nemesis-asr

On-device streaming speech recognition for the Record screen, so **live notes
read accurate text during a lecture** instead of Apple's on-device transcript.

Engine: [FluidAudio](https://github.com/FluidInference/FluidAudio) streaming
Parakeet EOU on CoreML / the Apple Neural Engine. 4.9% word error rate, ~12x
realtime, $0 per minute, audio never leaves the phone.

## What is verified and what is not

| Piece | Status |
|---|---|
| `ios/NemesisAsrEngine.swift` | **Compiles clean** against FluidAudio exactly `0.15.5` under Swift 6 strict concurrency (standalone SPM package) |
| `ios/RecordingFileWriter.swift` | **Compiles clean**, same package |
| `src/hooks/useParakeetTranscription.ts` | **Typechecks** |
| `normalizeRmsLevel` | **3 tests pass** |
| `src/lib/asr-engine.ts` selector | **10 tests pass** |
| `index.ts` | **Typechecks** |
| `ios/NemesisAsrModule.swift` | **Written, not compiled** — needs `ExpoModulesCore`, which only resolves inside a prebuilt iOS project |
| Transcription quality, latency, battery | **Not measured** — needs a physical device |

CocoaPods could not be installed in the authoring environment (no admin
rights), so `expo prebuild && pod install` was never run. Everything below the
line in that table is reviewed-but-unbuilt.

## Two decisions needed before this ships

### 1. FluidAudio requires iOS 17.0

Both its `Package.swift` and its podspec say so, and the podspec here follows.
**This raises the app's minimum iOS version**, which drops iPhone X and older
(iOS 17 runs on iPhone XS and newer).

If that is unacceptable, the alternative is to keep the app's floor where it is
and gate the engine behind `@available(iOS 17.0, *)`, reporting `isSupported()
=== false` on older systems. The selector already falls back to Apple's
recognizer there, so no user loses recording either way — it is a question of
build configuration, not of product behaviour.

### 2. The model download

The Parakeet EOU model is ~120M parameters and downloads on first use from
HuggingFace via `AsrModels`. `shouldDownloadAsrModel()` refuses to start it on
a metered or unknown connection and never auto-retries a failure, but **nothing
yet drives that policy** — the download currently happens implicitly inside
`prepare()`. Wiring an explicit, cancellable, wifi-gated download with visible
progress is the next task after the hook.

FluidAudio also supports `ModelHub.offlineMode` with a bundled model directory,
which would trade app size for never downloading at all.

## Integration notes

**The podspec pulls FluidAudio over SPM, not CocoaPods.** The published pod
lags the git tags — trunk was still on `0.12.2` when this landed, while the
verified version is `0.15.5`. `spm_dependency` in an Expo module podspec is the
supported path for this.

**The bridge is deliberately thin.** Every decision that can be made in
TypeScript — which engine to use, when to download, what to tell the student —
lives in `src/lib/asr-engine.ts` where it is testable. The Swift only moves
audio and text across the boundary.

**Android is untouched and that is intentional.** FluidAudio is Apple-only;
Android keeps `expo-speech-recognition`, which is what it has today.

## First build

```bash
cd apps/mobile
npx expo prebuild --platform ios --clean
npx pod-install
npx expo run:ios --device
```

Expect the first `prepare()` call to download the model. The simulator has no
Neural Engine, so CoreML falls back to CPU there — **a simulator failure is not
diagnostic**, test on hardware.

## Remaining work

1. ~~`useParakeetTranscription` hook~~ — done, same shape as
   `useLiveTranscription`.
2. A selector hook that calls `selectAsrEngine()` and returns one of the two,
   then swapping it into `RecordSession`. Blocked on (3), because wiring it
   today would leave `shouldDownloadAsrModel()` dead.
3. Explicit wifi-gated model download with progress. **Needs a new dependency**
   — the project has no `expo-network` / netinfo, so there is currently no way
   to tell wifi from cellular. Owner's call. Model-ready state can persist in
   `expo-secure-store`, which is already here.
3. ~~Persist audio alongside Parakeet~~ — done, `RecordingFileWriter` writes
   16 kHz mono 16-bit (~115 MB/hour, vs ~690 MB/hour for raw float32 48 kHz).
4. Device measurement: accuracy against the current transcript, latency,
   battery, thermals over a 90-minute lecture.
5. Once accuracy is confirmed on device, decide whether the server enhance pass
   is still worth its cost at all.
