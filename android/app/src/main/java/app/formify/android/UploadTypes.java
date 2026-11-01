package app.formify.android;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** Translate HTML file extensions to the MIME filters Android's picker expects. */
final class UploadTypes {
    private static String extensionMime(String extension) {
        return switch (extension) {
            case ".pdf" -> "application/pdf";
            case ".docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case ".png" -> "image/png";
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".webp" -> "image/webp";
            case ".txt" -> "text/plain";
            case ".md" -> "text/markdown";
            case ".csv" -> "text/csv";
            case ".xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case ".odt" -> "application/vnd.oasis.opendocument.text";
            default -> null;
        };
    }

    static String[] mimeTypes(String[] accepted) {
        Set<String> types = new LinkedHashSet<>();
        if (accepted != null) for (String group : accepted) {
            if (group == null) continue;
            for (String part : group.split(",")) {
                String token = part.trim().toLowerCase(Locale.ROOT);
                String mime = extensionMime(token);
                if (mime != null) types.add(mime);
                else if (token.equals("*/*") || token.matches("[a-z0-9.+_-]+/(?:[a-z0-9.+_-]+|\\*)")) types.add(token);
            }
        }
        return types.isEmpty() ? new String[]{"*/*"} : types.toArray(new String[0]);
    }

    static boolean imagesOnly(String[] types) {
        if (types.length == 0) return false;
        for (String type : types) if (!type.startsWith("image/")) return false;
        return true;
    }
}
