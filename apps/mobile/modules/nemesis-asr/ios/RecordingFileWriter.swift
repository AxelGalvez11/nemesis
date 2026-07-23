// AVFAudio predates strict concurrency and does not mark AVAudioPCMBuffer /
// AVAudioConverter Sendable, which is the compiler's own suggested remedy.
@preconcurrency import AVFoundation
import Foundation

/// Writes the live microphone stream to disk while Parakeet transcribes it.
///
/// Apple's recognizer got this for free (`recordingOptions.persist`), and the
/// server enhance pass reads the resulting file. An AVAudioEngine tap does not,
/// so the file is written here — otherwise switching engines would silently
/// remove the enhance pass and the notes rebuild that rides on it.
///
/// 16 kHz mono 16-bit on purpose: it is what the transcription route expects,
/// and it costs ~115 MB/hour instead of the ~690 MB/hour a float32 48 kHz file
/// would. A three-hour lecture is the difference between a large file and an
/// unusable one.
final class RecordingFileWriter {
    enum WriterError: Error {
        case unsupportedFormat
    }

    private let file: AVAudioFile
    private let converter: AVAudioConverter
    private let outputFormat: AVAudioFormat

    let url: URL

    init(url: URL, inputFormat: AVAudioFormat) throws {
        guard
            let output = AVAudioFormat(
                commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true),
            let converter = AVAudioConverter(from: inputFormat, to: output)
        else { throw WriterError.unsupportedFormat }

        self.url = url
        self.outputFormat = output
        self.converter = converter
        // `commonFormat: .pcmFormatInt16` makes AVAudioFile store the samples as
        // 16-bit rather than converting to its float default on write.
        self.file = try AVAudioFile(
            forWriting: url, settings: output.settings, commonFormat: .pcmFormatInt16, interleaved: true)
    }

    /// Convert one microphone chunk to the output format and append it.
    ///
    /// Takes SAMPLES rather than a buffer so nothing is shared with the
    /// transcription actor: handing the same AVAudioPCMBuffer to both is a data
    /// race, and the writer has to build its own input buffer for the converter
    /// anyway.
    ///
    /// Never throws upward: a dropped chunk costs a moment of audio, and taking
    /// a lecture down to preserve a byte-perfect file is the wrong trade.
    func append(samples: [Float], sampleRate: Double) {
        guard
            let inputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false),
            let buffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(samples.count)),
            let channel = buffer.floatChannelData?[0]
        else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { source in
            guard let base = source.baseAddress else { return }
            channel.update(from: base, count: samples.count)
        }

        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
        guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }

        nonisolated(unsafe) var consumed = false
        var conversionError: NSError?
        // The converter pulls; handing it the buffer once and then signalling
        // end-of-stream is what stops it asking for more and stalling.
        converter.convert(to: converted, error: &conversionError) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        guard conversionError == nil, converted.frameLength > 0 else { return }
        try? file.write(from: converted)
    }
}
