package app.formify.android;

import java.net.URI;
import java.util.Locale;

/** Exact origin matching: lookalike domains and non-HTTPS pages never enter the app. */
final class NavigationPolicy {
    static final String HOME = "https://getformify.pages.dev/";

    static boolean isInternal(String url) {
        try {
            URI uri = URI.create(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && "getformify.pages.dev".equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (RuntimeException e) {
            return false;
        }
    }

    static boolean isExternal(String url) {
        try {
            String scheme = URI.create(url).getScheme();
            if (scheme == null) return false;
            return switch (scheme.toLowerCase(Locale.ROOT)) {
                case "https", "http", "mailto", "tel", "geo" -> true;
                default -> false;
            };
        } catch (RuntimeException e) {
            return false;
        }
    }
}
