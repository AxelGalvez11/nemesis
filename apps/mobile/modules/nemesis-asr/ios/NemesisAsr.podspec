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

  # Pulled over SPM, NOT from the CocoaPods trunk: the published FluidAudio pod
  # lags its git tags (trunk was still on 0.12.2 when this landed), and 0.15.5
  # is the version NemesisAsrEngine.swift was compiled and verified against.
  spm_dependency(s,
    url: 'https://github.com/FluidInference/FluidAudio.git',
    requirement: { kind: 'exactVersion', version: '0.15.5' },
    products: ['FluidAudio']
  )

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
