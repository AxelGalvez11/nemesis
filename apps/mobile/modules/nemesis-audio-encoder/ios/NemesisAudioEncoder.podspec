Pod::Spec.new do |s|
  s.name           = 'NemesisAudioEncoder'
  s.version        = '1.0.0'
  s.summary        = 'Re-encode recorded PCM as AAC before upload.'
  s.description    = 'Local Expo module. WAV -> m4a/AAC, so a lecture uploads at ~14MB/hr instead of ~115MB/hr and fits the recordings bucket.'
  s.license        = 'MIT'
  s.author         = 'Nemesis'
  s.homepage       = 'https://enternemesis.com'
  # Matches the floor the Expo SDK 56 modules already build against.
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
