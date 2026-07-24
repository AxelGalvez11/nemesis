Pod::Spec.new do |s|
  s.name           = 'NemesisAsr'
  s.version        = '1.0.0'
  s.summary        = 'On-device streaming speech recognition for the Nemesis recorder'
  s.description    = 'Bridges FluidAudio streaming Parakeet (CoreML/ANE) to the Record screen.'
  s.author         = 'Nemesis'
  s.homepage       = 'https://enternemesis.com'
  s.license        = { :type => 'UNLICENSED' }
  # FluidAudio is iOS 17+ (its own Package.swift and podspec both say so), so
  # this module cannot build below that. See the module README: the engine
  # selector already falls back to Apple's recognizer wherever Parakeet cannot
  # run, so raising the floor is a build-time decision, not a product cliff.
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '6.0'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # FluidAudio arrives as a plain CocoaPods dependency. It is pinned to the
  # v0.15.5 git tag by withFluidAudioPod.js, because the version published to
  # the CocoaPods trunk (0.7.8) predates the streaming Parakeet API entirely.
  #
  # It used to be an spm_dependency, which is why build 20 failed: a Swift
  # Package inside a statically-linked CocoaPods project breaks the target
  # dependency graph for the WHOLE workspace — the app target compiled before
  # any pod did and every module map went missing, Expo's included. CocoaPods
  # warns about exactly this ("using swift package(s) FluidAudio with static
  # linking"). The documented alternative is dynamic frameworks, which would
  # relink all 123 pods; sourcing the pod from git instead touches only this one.
  s.dependency 'FluidAudio'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
