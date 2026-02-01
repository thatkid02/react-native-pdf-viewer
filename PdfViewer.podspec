require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "PdfViewer"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/thatkid02/react-native-pdf-viewer.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{h,m,mm,swift}",
    "cpp/**/*.{hpp,cpp}",
  ]

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'

  load 'nitrogen/generated/ios/PdfViewer+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
