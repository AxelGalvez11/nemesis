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

    private let manager: any StreamingAsrManager
    private var state: State = .idle
    private var engine: AVAudioEngine?

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

    /// Start capturing the microphone and feeding the engine.
    public func start() async throws {
        try await prepare()
        guard state == .ready else { return }
        try await manager.reset()

        let audioEngine = AVAudioEngine()
        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            // AVAudioPCMBuffer is NOT Sendable and this closure runs on a
            // realtime audio thread, so the samples are copied out here and the
            // buffer is rebuilt inside the actor. Handing the buffer itself
            // across an actor boundary is a data race the compiler is right to
            // reject — and a realtime thread is the worst place to find one.
            guard let samples = Self.copySamples(from: buffer) else { return }
            let rate = buffer.format.sampleRate
            Task { await self.consume(samples: samples, sampleRate: rate) }
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

    private func consume(samples: [Float], sampleRate: Double) async {
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
        do {
            try await manager.appendAudio(buffer)
            try await manager.processBufferedAudio()
        } catch {
            // A dropped chunk must not kill a lecture — the next one still lands.
        }
    }

    /// Stop the microphone and return the final transcript.
    public func stop() async throws -> String {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        guard state == .running else { return await manager.getPartialTranscript() }
        state = .finished
        let text = try await manager.finish()
        state = .ready
        return text
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
