// swift-tools-version: 6.0
// Generated template for Swift Playground on iPad.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "MINDS",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "MINDS",
            targets: ["AppModule"],
            bundleIdentifier: "local.minds.isabella.playground",
            displayVersion: "0.1",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .circle),
            accentColor: .presetColor(.gray),
            supportedDeviceFamilies: [
                .phone,
                .pad
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ],
            appCategory: .productivity
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "Sources"
        )
    ],
    swiftLanguageVersions: [.version("6")]
)
