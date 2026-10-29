// swift-tools-version: 5.9
import PackageDescription

// (The package and its library named as Capacitor names it from the npm name kraltirpan-thermal.)
let package = Package(
    name: "KraltirpanThermal",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "KraltirpanThermal",
            targets: ["ThermalPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "ThermalPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/ThermalPlugin")
    ]
)
