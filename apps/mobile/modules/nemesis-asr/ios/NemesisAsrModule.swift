import ExpoModulesCore

/// Expo bridge over NemesisAsrEngine. Deliberately thin: every decision that
/// can be made in TypeScript (which engine to use, when to download, what to
/// tell the student) lives in src/lib/asr-engine.ts, where it is testable. This
/// file only moves audio and text across the boundary.
///
/// NOTE: NemesisAsrEngine.swift is compile-verified against FluidAudio 0.15.5.
/// This file is NOT — it needs ExpoModulesCore, which only resolves inside a
/// prebuilt iOS project. Treat it as reviewed-but-unbuilt until the first
/// `expo prebuild && pod install` run.
public class NemesisAsrModule: Module {
    private let engine = NemesisAsrEngine()

    public func definition() -> ModuleDefinition {
        Name("NemesisAsr")

        // The growing transcript, pushed as the engine decodes. Mirrors the
        // shape of expo-speech-recognition's "result" event so the two engines
        // can sit behind one hook.
        Events("onPartialTranscript")

        /// The JS side treats a missing module as "not available" already; this
        /// exists so a build that HAS the module can still report an OS too old
        /// to run it, rather than throwing on first use.
        Function("isSupported") { () -> Bool in
            if #available(iOS 17.0, *) { return true }
            return false
        }

        AsyncFunction("prepare") { () async throws in
            try await self.engine.prepare()
        }

        AsyncFunction("start") { () async throws in
            await self.engine.onPartialTranscript { [weak self] text in
                self?.sendEvent("onPartialTranscript", ["transcript": text])
            }
            try await self.engine.start()
        }

        AsyncFunction("stop") { () async throws -> String in
            try await self.engine.stop()
        }

        AsyncFunction("partialTranscript") { () async -> String in
            await self.engine.partialTranscript()
        }

        AsyncFunction("release") { () async in
            await self.engine.release()
        }

        /// Leaving the screen mid-recording must not leave the mic running --
        /// same contract useLiveTranscription already honours for Apple's engine.
        OnDestroy {
            Task { [engine] in
                _ = try? await engine.stop()
                await engine.release()
            }
        }
    }
}
