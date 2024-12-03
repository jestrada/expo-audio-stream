require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoAudioStream'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '13.4', :tvos => '13.4' }
  s.swift_version  = '5.4'
  s.source         = { git: 'https://github.com/deeeed/expo-audio-stream' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'ENABLE_TESTING_SEARCH_PATHS' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift}"

  s.exclude_files = 'Tests/'
  s.test_spec do |test_spec|
    # test_spec.dependency 'OCMock' # This dependency will only be linked with your tests.

    test_spec.source_files = 'Tests/**/*.{m,swift}'
    test_spec.dependency 'ExpoModulesCore'
    test_spec.framework = 'XCTest'
  end
end
