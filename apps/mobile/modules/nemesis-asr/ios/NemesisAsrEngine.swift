import AVFoundation
import FluidAudio
import Foundation

/// Live on-device transcription for the Record screen, wrapping FluidAudio's
/// streaming Parakeet EOU engine. This is the piece that lets live notes read
/// ACCURATE text during a lecture instead of Apple's on-device transcript.
///
/// Deliberately UI-free and Expo-free so it can be compiled and exercised on
/// its own; the Expo module is a thin bridge over this type.
public actor NemesisAsrEngine {
    public enum State: String, Sendable {
        case idle, loading, ready, running, finished
    }

    public enum EngineError: Error {
        /// start() was called before prepare() succeeded. Deliberate: prepare()
        /// is the only thing that may download the model, so making start()
        /// auto-prepare would let a few hundred megabytes leave over cellular
        /// behind the caller's back. The wifi gate lives in JS and can only
        /// work if this is the one door.
        case notPrepared
    }

    private let manager: any StreamingAsrManager
    private var state: State = .idle
    private var engine: AVAudioEngine?
    private var writer: RecordingFileWriter?
    private var onLevel: (@Sendable (Float) -> Void)?

    /// 160ms chunks — the lowest-latency variant, which is what a live caption
    /// under a growing transcript wants. 320/1600ms trade latency for throughput.
    public init(variant: StreamingModelVariant = .parakeetEou160ms) {
        self.manager = variant.createManager()
    }

    public var currentState: State { state }

    public var displayName: String {
        get async { await manager.displayName }
    }

    /// Downloads the model on first use and loads it. Idempotent.
    public func prepare() async throws {
        guard state == .idle else { return }
        state = .loading
        do {
            try await manager.loadModels()
            state = .ready
        } catch {
            state = .idle
            throw error
        }
    }

    /// Partial transcripts as they grow — the live-caption feed.
    public func onPartialTranscript(_ callback: @escaping @Sendable (String) -> Void) async {
        await manager.setPartialTranscriptCallback(callback)
    }

    /// Input loudness, 0...1, for the recorder's waveform. Apple's recognizer
    /// emitted this as `volumechange`; an AVAudioEngine tap does not, and
    /// without it the waveform is a canned animation again.
    public func onAudioLevel(_ callback: @escaping @Sendable (Float) -> Void) {
        onLevel = callback
    }

    /// Start capturing the microphone and feeding the engine.
    ///
    /// Requires a successful prepare(). It does NOT prepare on your behalf —
    /// see EngineError.notPrepared.
    public func start() async throws {
        guard state == .ready else { throw EngineError.notPrepared }
        try await manager.reset()

        let audioEngine = AVAudioEngine()
        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        // Keep the audio too: the server enhance pass (and the notes rebuild
        // riding on it) reads this file. Failing to open it must not stop the
        // recording — a lecture transcribed with no enhance pass beats no
        // lecture at all.
        let target = FileManager.default.temporaryDirectory
            .appendingPathComponent("nemesis-\(UUID().uuidString).wav")
        writer = try? RecordingFileWriter(url: target, inputFormat: format)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            // AVAudioPCMBuffer is NOT Sendable and this closure runs on a
            // realtime audio thread, so the samples are copied out here and the
            // buffer is rebuilt inside the actor. Handing the buffer itself
            // across an actor boundary is a data race the compiler is right to
            // reject — and a realtime thread is the worst place to find one.
            guard let samples = Self.copySamples(from: buffer) else { return }
            let rate = buffer.format.sampleRate
            let level = Self.rms(of: samples)
            Task { await self.consume(samples: samples, sampleRate: rate, level: level) }
        }
        audioEngine.prepare()
        try audioEngine.start()
        engine = audioEngine
        state = .running
    }

    /// Channel 0 only: speech is mono, and the engine resamples internally.
    private nonisolated static func copySamples(from buffer: AVAudioPCMBuffer) -> [Float]? {
        guard let channel = buffer.floatChannelData?[0] else { return nil }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return nil }
        return Array(UnsafeBufferPointer(start: channel, count: count))
    }

    /// Root-mean-square loudness of one chunk. Computed on the audio thread so
    /// the actor hop carries a single Float instead of the samples twice over.
    private nonisolated static func rms(of samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        var sum: Float = 0
        for sample in samples { sum += sample * sample }
        return (sum / Float(samples.count)).squareRoot()
    }

    private func consume(samples: [Float], sampleRate: Double, level: Float) async {
        onLevel?(level)
        guard state == .running,
            let format = AVAudioFormat(
                commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
            let destination = buffer.floatChannelData?[0]
        else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { source in
            guard let base = source.baseAddress else { return }
            destination.update(from: base, count: samples.count)
        }
        writer?.append(samples: samples, sampleRate: sampleRate)
        do {
            try await manager.appendAudio(buffer)
            try await manager.processBufferedAudio()
        } catch {
            // A dropped chunk must not kill a lecture — the next one still lands.
        }
    }

    /// What one recording produced: the final text, and the audio the enhance
    /// pass can still upload. `audioPath` is nil when the file could not be
    /// opened — the transcript is the load-bearing half.
    public struct Recording: Sendable {
        public let transcript: String
        public let audioPath: String?
    }

    /// Stop the microphone and return the final transcript plus the audio file.
    public func stop() async throws -> Recording {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        let audioPath = writer?.url.path
        writer = nil
        guard state == .running else {
            return Recording(transcript: await manager.getPartialTranscript(), audioPath: audioPath)
        }
        state = .finished
        let text = try await manager.finish()
        state = .ready
        return Recording(transcript: text, audioPath: audioPath)
    }

    /// The transcript so far, without ending the session.
    public func partialTranscript() async -> String {
        await manager.getPartialTranscript()
    }

    /// Free the model. `prepare()` must be called again afterwards.
    public func release() async {
        await manager.cleanup()
        state = .idle
    }
}
