package com.teo.ledger;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class PaymentNotificationService extends NotificationListenerService {

    private static final String TAG = "PaymentNotification";
    private static final Pattern AMOUNT = Pattern.compile("\\d[\\d,]*\\s*원");

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        String packageName = notification.getPackageName();
        if (packageName.equals(getPackageName())) return;
        if (!CaptureStore.getAllowedPackages(this).contains(packageName)) return;

        Notification content = notification.getNotification();
        if ((content.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = content.extras;
        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = readBody(extras);
        if (!AMOUNT.matcher(title + " " + body).find()) return;

        try {
            JSONObject capture = new JSONObject();
            capture.put("key", packageName + "|" + notification.getPostTime() + "|" + (title + body).hashCode());
            capture.put("packageName", packageName);
            capture.put("appLabel", appLabel(packageName));
            capture.put("title", title);
            capture.put("text", body);
            capture.put("postedAt", notification.getPostTime());
            CaptureStore.append(this, capture);
        } catch (Exception error) {
            Log.w(TAG, "알림 저장 실패", error);
        }
    }

    private String readBody(Bundle extras) {
        CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (bigText != null && bigText.length() > 0) return bigText.toString();

        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null && lines.length > 0) {
            StringBuilder joined = new StringBuilder();
            for (CharSequence line : lines) joined.append(line).append('\n');
            return joined.toString().trim();
        }
        return text(extras.getCharSequence(Notification.EXTRA_TEXT));
    }

    private String appLabel(String packageName) {
        try {
            PackageManager packageManager = getPackageManager();
            ApplicationInfo info = packageManager.getApplicationInfo(packageName, 0);
            return packageManager.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException error) {
            return packageName;
        }
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString();
    }
}
