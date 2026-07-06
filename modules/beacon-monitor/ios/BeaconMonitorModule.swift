import CoreLocation
import ExpoModulesCore

internal final class InvalidUuidException: GenericException<String> {
  override var reason: String {
    "Invalid beacon UUID: \(param)"
  }
}

public class BeaconMonitorModule: Module {
  private lazy var beaconManager = BeaconLocationManager()

  public func definition() -> ModuleDefinition {
    Name("BeaconMonitor")

    Events("onBeacons", "onRegionChange", "onAuthorization")

    OnCreate {
      self.beaconManager.onBeacons = { [weak self] payload in
        self?.sendEvent("onBeacons", payload)
      }
      self.beaconManager.onRegionChange = { [weak self] payload in
        self?.sendEvent("onRegionChange", payload)
      }
      self.beaconManager.onAuthorization = { [weak self] payload in
        self?.sendEvent("onAuthorization", payload)
      }
    }

    Function("getAuthorizationStatus") { () -> String in
      self.beaconManager.authorizationDescription()
    }

    AsyncFunction("requestAlwaysAuthorization") {
      self.beaconManager.requestAlwaysAuthorization()
    }.runOnQueue(.main)

    AsyncFunction("startMonitoring") { (uuidString: String) in
      guard let uuid = UUID(uuidString: uuidString) else {
        throw InvalidUuidException(uuidString)
      }
      self.beaconManager.start(uuid: uuid)
    }.runOnQueue(.main)

    AsyncFunction("stopMonitoring") {
      self.beaconManager.stop()
    }.runOnQueue(.main)
  }
}

/// CLLocationManagerDelegate must be an NSObject; the Expo Module class is not,
/// so beacon logic lives in this helper and reports back through closures.
final class BeaconLocationManager: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var constraint: CLBeaconIdentityConstraint?

  var onBeacons: (([String: Any]) -> Void)?
  var onRegionChange: (([String: Any]) -> Void)?
  var onAuthorization: (([String: Any]) -> Void)?

  override init() {
    super.init()
    manager.delegate = self
    // Ranging drives everything; location updates exist only to keep the app
    // alive in the background, so the coarsest settings are fine.
    manager.desiredAccuracy = kCLLocationAccuracyThreeKilometers
    manager.distanceFilter = CLLocationDistanceMax
    manager.pausesLocationUpdatesAutomatically = false
  }

  func authorizationDescription() -> String {
    switch manager.authorizationStatus {
    case .authorizedAlways: return "always"
    case .authorizedWhenInUse: return "whenInUse"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }

  func requestAlwaysAuthorization() {
    // iOS requires the when-in-use step before it will show the Always upgrade.
    if manager.authorizationStatus == .notDetermined {
      manager.requestWhenInUseAuthorization()
    } else {
      manager.requestAlwaysAuthorization()
    }
  }

  func start(uuid: UUID) {
    stop()
    let constraint = CLBeaconIdentityConstraint(uuid: uuid)
    self.constraint = constraint
    let region = CLBeaconRegion(
      beaconIdentityConstraint: constraint,
      identifier: "doctorishere-\(uuid.uuidString)"
    )
    region.notifyEntryStateOnDisplay = true
    manager.startMonitoring(for: region)
    manager.startRangingBeacons(satisfying: constraint)
    enableBackgroundRangingIfAuthorized()
  }

  func stop() {
    if let constraint {
      manager.stopRangingBeacons(satisfying: constraint)
    }
    for region in manager.monitoredRegions where region.identifier.hasPrefix("doctorishere-") {
      manager.stopMonitoring(for: region)
    }
    manager.stopUpdatingLocation()
    constraint = nil
  }

  /// With Always authorization, a background location session keeps ranging
  /// callbacks flowing while the app is backgrounded (demo requirement DA-08).
  private func enableBackgroundRangingIfAuthorized() {
    guard constraint != nil, manager.authorizationStatus == .authorizedAlways else { return }
    manager.allowsBackgroundLocationUpdates = true
    manager.showsBackgroundLocationIndicator = false
    manager.startUpdatingLocation()
  }

  // MARK: - CLLocationManagerDelegate

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    onAuthorization?(["status": authorizationDescription()])
    if manager.authorizationStatus == .notDetermined {
      return
    }
    if manager.authorizationStatus == .authorizedWhenInUse {
      // Upgrade prompt: user granted when-in-use from the first dialog.
      manager.requestAlwaysAuthorization()
    }
    enableBackgroundRangingIfAuthorized()
  }

  func locationManager(
    _ manager: CLLocationManager,
    didRange beacons: [CLBeacon],
    satisfying constraint: CLBeaconIdentityConstraint
  ) {
    guard !beacons.isEmpty else { return }
    let payload = beacons.map { beacon -> [String: Any] in
      [
        "uuid": beacon.uuid.uuidString,
        "major": beacon.major.intValue,
        "minor": beacon.minor.intValue,
        "rssi": beacon.rssi,
        "proximity": proximityDescription(beacon.proximity),
      ]
    }
    onBeacons?(["beacons": payload])
  }

  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    onRegionChange?(["event": "enter", "identifier": region.identifier])
  }

  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    onRegionChange?(["event": "exit", "identifier": region.identifier])
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Transient CoreLocation errors (e.g. kCLErrorDomain 16) are common; ignore.
  }

  private func proximityDescription(_ proximity: CLProximity) -> String {
    switch proximity {
    case .immediate: return "immediate"
    case .near: return "near"
    case .far: return "far"
    case .unknown: return "unknown"
    @unknown default: return "unknown"
    }
  }
}
