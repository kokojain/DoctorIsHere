Pod::Spec.new do |s|
  s.name           = 'BeaconMonitor'
  s.version        = '1.0.0'
  s.summary        = 'iBeacon region monitoring and ranging for DoctorIsHere'
  s.description    = 'CoreLocation-based iBeacon monitoring exposed as an Expo module.'
  s.author         = 'Knob LLC'
  s.homepage       = 'https://github.com/kokojain/DoctorIsHere'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.license        = { :type => 'MIT' }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end
