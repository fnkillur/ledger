package com.teo.ledger;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

final class CaptureStore {

    private static final String FILE_NAME = "payment_captures.jsonl";
    private static final String PREFERENCES = "notification_capture";
    private static final String ALLOWED_PACKAGES = "allowed_packages";

    private CaptureStore() {}

    static Set<String> getAllowedPackages(Context context) {
        return new HashSet<>(preferences(context).getStringSet(ALLOWED_PACKAGES, new HashSet<>()));
    }

    static void setAllowedPackages(Context context, Set<String> packages) {
        preferences(context).edit().putStringSet(ALLOWED_PACKAGES, packages).apply();
    }

    static synchronized void append(Context context, JSONObject capture) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file(context), true)) {
            output.write((capture.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
    }

    static synchronized List<JSONObject> readAll(Context context) throws IOException {
        List<JSONObject> captures = new ArrayList<>();
        File file = file(context);
        if (!file.exists()) return captures;

        for (String line : Files.readAllLines(file.toPath(), StandardCharsets.UTF_8)) {
            if (line.isEmpty()) continue;
            try {
                captures.add(new JSONObject(line));
            } catch (JSONException ignored) {
                // 기록 중 앱이 종료돼 잘린 줄은 건너뛴다.
            }
        }
        return captures;
    }

    static synchronized void remove(Context context, Set<String> keys) throws IOException {
        StringBuilder remaining = new StringBuilder();
        for (JSONObject capture : readAll(context)) {
            if (keys.contains(capture.optString("key"))) continue;
            remaining.append(capture).append('\n');
        }
        Files.write(file(context).toPath(), remaining.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
