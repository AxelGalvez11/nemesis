import AVFoundation

// The transcode itself, with NO ExpoModulesCore import.
//
// Split out from the module wrapper on purpose: this repo has no `ios/`
// directory (native code is generated at build time), so the only way to catch a
// Swift mistake before spending a remote build is
//
//   swiftc -typecheck -sdk "$(xcrun --sdk iphoneos --show-sdk-path)" \
//     -target arm64-apple-ios16.4 AudioEncoder.swift
//
// which cannot resolve ExpoModulesCore. Everything that could plausibly be wrong
// lives here, where that command can see it.

enum AudioEncodeError: Error, LocalizedError {
  case unreadableSource(String)
  case unwritableTarget(String)
  case bufferAllocationFailed

  var errorDescription: String? {
    switch self {
    case .unreadableSource(let detail): return "The recorded audio could not be read (\(detail))."
    case .unwritableTarget(let detail): return "The compressed copy could not be written (\(detail))."
    case .bufferAllocationFailed: return "The phone could not allocate an audio buffer."
    }
  }
}

struct EncodedAudio {
  let path: String
  let seconds: Double
  let bytes: Int
}

enum AudioEncoder {
  /**
   Re-encode a PCM WAV as AAC in an m4a container.

   Why this exists: `expo-speech-recognition` can only persist raw PCM (its iOS
   `outputEncoding` option has no compressed case), which is ~115 MB per hour.
   The `recordings` bucket caps a file at 40 MB and does not list `audio/wav`
   among its accepted types, so every phone upload was rejected outright. AAC at
   32 kbps is ~14 MB per hour and `audio/m4a` is already on the accepted list —
   so this is not merely an optimisation, it is the thing that makes the upload
   possible at all, with no change to production storage.

   Note this does NOT reduce the transcription bill: providers charge by
   DURATION, not by bytes. Cutting the bill is `lib/wav-trim.ts`'s job, and it
   runs first — trim the raw PCM, then compress what survives.
   */
  static func encodeToM4A(sourcePath: String, targetPath: String, bitRate: Int) throws -> EncodedAudio {
    let sourceURL = URL(fileURLWithPath: sourcePath)
    let targetURL = URL(fileURLWithPath: targetPath)
    var sourceSeconds = 0.0

    // A leftover file at the target would be appended to rather than replaced.
    if FileManager.default.fileExists(atPath: targetPath) {
      try? FileManager.default.removeItem(at: targetURL)
    }

    // Scoped so both AVAudioFiles deallocate — and the encoder flushes its tail
    // to disk — BEFORE the size is read below. Reading it while the writer is
    // still alive reports a short file.
    do {
      let input: AVAudioFile
      do {
        input = try AVAudioFile(forReading: sourceURL)
      } catch {
        throw AudioEncodeError.unreadableSource(error.localizedDescription)
      }

      // Matching the source's rate and channel count keeps the two files'
      // processingFormats identical, which is what lets one buffer be read from
      // the first and written straight to the second.
      let format = input.processingFormat
      sourceSeconds = format.sampleRate > 0 ? Double(input.length) / format.sampleRate : 0

      let settings: [String: Any] = [
        AVEncoderBitRateKey: bitRate,
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVNumberOfChannelsKey: Int(format.channelCount),
        AVSampleRateKey: format.sampleRate,
      ]

      let output: AVAudioFile
      do {
        output = try AVAudioFile(forWriting: targetURL, settings: settings)
      } catch {
        throw AudioEncodeError.unwritableTarget(error.localizedDescription)
      }

      // ~2s per pass at 16kHz. Streams the file rather than holding a lecture in
      // memory, which is the whole reason the JS side hands this off natively.
      let frameCapacity: AVAudioFrameCount = 32_768
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCapacity) else {
        throw AudioEncodeError.bufferAllocationFailed
      }

      while input.framePosition < input.length {
        do {
          try input.read(into: buffer, frameCount: frameCapacity)
        } catch {
          throw AudioEncodeError.unreadableSource(error.localizedDescription)
        }
        // A zero-length read means the file ended early — stop rather than spin.
        if buffer.frameLength == 0 { break }
        do {
          try output.write(from: buffer)
        } catch {
          throw AudioEncodeError.unwritableTarget(error.localizedDescription)
        }
      }
    }

    let attributes = try? FileManager.default.attributesOfItem(atPath: targetPath)
    let bytes = (attributes?[.size] as? NSNumber)?.intValue ?? 0
    return EncodedAudio(path: targetPath, seconds: sourceSeconds, bytes: bytes)
  }
}
