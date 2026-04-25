import Capacitor
import Foundation

class AppViewController: CAPBridgeViewController {
    private let serverUrlDefaultsKey = "CapacitorStorage.serverUrl"

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()

        if let savedServerUrl = UserDefaults.standard.string(forKey: serverUrlDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !savedServerUrl.isEmpty {
            if isUsableServerUrl(savedServerUrl) {
                descriptor.serverURL = savedServerUrl
            } else {
                UserDefaults.standard.removeObject(forKey: serverUrlDefaultsKey)
            }
        }

        return descriptor
    }

    private func isUsableServerUrl(_ rawValue: String) -> Bool {
        guard let components = URLComponents(string: rawValue),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased() else {
            return false
        }

        guard scheme == "http" || scheme == "https" else {
            return false
        }

        if host == "localhost" || host == "0.0.0.0" || host == "::1" || host == "::" {
            return false
        }
        if host == "127.0.0.1" || host.hasPrefix("127.") {
            return false
        }
        if host.hasPrefix("192.168.56.") {
            return false
        }

        return true
    }
}
