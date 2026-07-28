import ExpoModulesCore

// Thin bridge. Every line that could be wrong about AVFoundation lives in
// AudioEncoder.swift, which typechecks locally without ExpoModulesCore — see the
// note at the top of that file.

public class NemesisAudioEncoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NemesisAudioEncoder")

    // Async: an hour of audio takes a few seconds to re-encode, and this must
    // not block the JS thread while the student is looking at the save screen.
    AsyncFunction("encodeToM4A") { (sourceUri: String, targetUri: String, bitRate: Int) -> [String: Any] in
      let encoded = try AudioEncoder.encodeToM4A(
        sourcePath: Self.filePath(from: sourceUri),
        targetPath: Self.filePath(from: targetUri),
        bitRate: bitRate
      )
      return [
        "bytes": encoded.bytes,
        "seconds": encoded.seconds,
        "uri": URL(fileURLWithPath: encoded.path).absoluteString,
      ]
    }
  }

  /// expo-file-system hands out `file://` URIs; AVAudioFile wants a plain path.
  /// A caller that already passes a path is accepted unchanged.
  private static func filePath(from uri: String) -> String {
    if let url = URL(string: uri), url.isFileURL {
      return url.path
    }
    return uri
  }
}
