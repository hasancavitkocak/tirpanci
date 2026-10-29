import Foundation
import UIKit
import Capacitor

/**
 * How warm the phone is (ProcessInfo's thermal state: 0 nominal, 1 fair, 2 serious, 3 critical), whether
 * Low Power Mode is on, and its battery (level 0..1, -1 unknown; charging). The game asks every few seconds.
 */
@objc(ThermalPlugin)
public class ThermalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThermalPlugin"
    public let jsName = "Thermal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let info = ProcessInfo.processInfo
            let device = UIDevice.current
            device.isBatteryMonitoringEnabled = true
            let thermal: Int
            switch info.thermalState {
            case .nominal: thermal = 0
            case .fair: thermal = 1
            case .serious: thermal = 2
            case .critical: thermal = 3
            @unknown default: thermal = 0
            }
            let charging = device.batteryState == .charging || device.batteryState == .full
            call.resolve([
                "thermal": thermal,
                "lowPower": info.isLowPowerModeEnabled,
                "battery": Double(device.batteryLevel),
                "charging": charging
            ])
        }
    }
}
