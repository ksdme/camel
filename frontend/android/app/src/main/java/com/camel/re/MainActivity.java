package com.camel.re;

import android.content.Context;
import android.os.Bundle;
import com.getcapacitor.CapConfig;
import com.getcapacitor.BridgeActivity;
import java.net.URI;

public class MainActivity extends BridgeActivity {

    private static final String CAPACITOR_STORAGE_NAME = "CapacitorStorage";
    private static final String SERVER_URL_KEY = "serverUrl";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        var prefs = getSharedPreferences(CAPACITOR_STORAGE_NAME, Context.MODE_PRIVATE);
        String savedServerUrl = prefs.getString(SERVER_URL_KEY, null);

        if (savedServerUrl != null && !savedServerUrl.trim().isEmpty()) {
            String normalized = savedServerUrl.trim();
            if (isUsableServerUrl(normalized)) {
                config = new CapConfig.Builder(this)
                    .setServerUrl(normalized)
                    .setAllowNavigation(new String[] {"*"})
                    .create();
            } else {
                // Recovery path: remove stale/unreachable URL and fall back to bundled shell.
                prefs.edit().remove(SERVER_URL_KEY).apply();
            }
        }

        super.onCreate(savedInstanceState);
    }

    private boolean isUsableServerUrl(String value) {
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();

            if (scheme == null || host == null) return false;
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return false;

            String lowerHost = host.toLowerCase();
            if ("localhost".equals(lowerHost)) return false;
            if ("0.0.0.0".equals(lowerHost)) return false;
            if ("127.0.0.1".equals(lowerHost)) return false;
            if ("::1".equals(lowerHost)) return false;
            if (lowerHost.startsWith("127.")) return false;
            // Common VirtualBox host-only adapter range that is unreachable from real devices.
            if (lowerHost.startsWith("192.168.56.")) return false;

            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
