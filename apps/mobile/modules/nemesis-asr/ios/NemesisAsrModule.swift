import ExpoModulesCore

/// Expo bridge over NemesisAsrEngine. Deliberately thin: every decision that
/// can be made in TypeScript (which engine to use, when to download, what to
/// tell the student) lives in src/lib/asr-engine.ts, where it is testable. This
/// file only moves audio and text across the boundary.
///
/// The `@unchecked Sendable` is load-bearing, not decoration. This pod builds
/// in Swift 6 language mode, where every value an `@Sendable` closure captures
/// must itself be Sendable — and ExpoModulesCore's `AsyncFunction` bodies are
/// `@Sendable`. Without it, all seven exported functions fail to compile with
/// "capture of 'self' with non-Sendable type 'NemesisAsrModule'".
///
/// It is honest here rather than a rubber stamp: this class's own state is a
/// single `let` reference to an actor (Sendable by definition), and the only
/// inherited state is `BaseModule.appContext`, assigned once at registration
/// before any exported function can run. ADDING A MUTABLE STORED PROPERTY TO
/// THIS CLASS MAKES THE CONFORMANCE A LIE — move it into the actor instead.
public final class NemesisAsrModule: Module, @unchecked Sendable {
    private let engine = NemesisAsrEngine()

    public func definition() -> ModuleDefinition {
        Name("NemesisAsr")

        // The growing transcript, pushed as the engine decodes. Mirrors the
        // shape of expo-speech-recognition's "result" event so the two engines
        // can sit behind one hook.
        Events("onPartialTranscript", "onAudioLevel")

        /// The JS side treats a missing module as "not available" already; this
        /// exists so a build that HAS the module can still report an OS too old
        /// to run it, rather than throwing on first use.
        Function("isSupported") { () -> Bool in
            if #available(iOS 17.0, *) { return true }
            return false
        }

        // These capture `engine` (an actor) rather than `self` wherever the
        // module itself isn't needed, so background work never retains the
        // module. Only the two event callbacks below need `self`.
        AsyncFunction("prepare") { [engine] () async throws in
            try await engine.prepare()
        }

        // `weak self` belongs on the INNER callbacks, not the outer capture
        // list: hoisting it out makes `self` an optional *var*, and reading a
        // captured var from concurrently-executing code is its own Swift 6
        // error. Verified both ways against the real AsyncFunction signature.
        AsyncFunction("start") { [engine] () async throws in
            await engine.onPartialTranscript { [weak self] text in
                self?.sendEvent("onPartialTranscript", ["transcript": text])
            }
            // Feeds the recorder waveform. Apple's recognizer emitted this as
            // `volumechange`; without it the waveform goes flat.
            await engine.onAudioLevel { [weak self] level in
                self?.sendEvent("onAudioLevel", ["level": Double(level)])
            }
            try await engine.start()
        }

        /// Returns BOTH halves: the transcript, and the audio file the server
        /// enhance pass uploads. Apple's recognizer wrote that file for free;
        /// an AVAudioEngine tap does not, so RecordingFileWriter does it here.
        AsyncFunction("stop") { [engine] () async throws -> [String: Any?] in
            let recording = try await engine.stop()
            return ["transcript": recording.transcript, "audioPath": recording.audioPath]
        }

        AsyncFunction("partialTranscript") { [engine] () async -> String in
            await engine.partialTranscript()
        }

        AsyncFunction("release") { [engine] () async in
            await engine.release()
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
