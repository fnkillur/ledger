package com.teo.ledger;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NotificationCapture")
public class NotificationCapturePlugin extends Plugin {

    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        boolean granted = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager packageManager = getContext().getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        Set<String> seen = new HashSet<>();
        JSArray apps = new JSArray();

        for (ResolveInfo info : packageManager.queryIntentActivities(launcher, 0)) {
            String packageName = info.activityInfo.packageName;
            if (packageName.equals(getContext().getPackageName()) || !seen.add(packageName)) continue;
            JSObject app = new JSObject();
            app.put("packageName", packageName);
            app.put("label", info.loadLabel(packageManager).toString());
            apps.put(app);
        }

        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void getAllowedPackages(PluginCall call) {
        JSObject result = new JSObject();
        result.put("packages", new JSArray(CaptureStore.getAllowedPackages(getContext())));
        call.resolve(result);
    }

    @PluginMethod
    public void setAllowedPackages(PluginCall call) {
        try {
            CaptureStore.setAllowedPackages(getContext(), toSet(call.getArray("packages", new JSArray())));
            call.resolve();
        } catch (JSONException error) {
            call.reject("packages 형식이 올바르지 않아요.", error);
        }
    }

    @PluginMethod
    public void readCaptures(PluginCall call) {
        try {
            JSArray captures = new JSArray();
            for (JSONObject capture : CaptureStore.readAll(getContext())) captures.put(capture);
            JSObject result = new JSObject();
            result.put("captures", captures);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("수집한 알림을 읽지 못했어요.", error);
        }
    }

    @PluginMethod
    public void removeCaptures(PluginCall call) {
        try {
            CaptureStore.remove(getContext(), toSet(call.getArray("keys", new JSArray())));
            call.resolve();
        } catch (Exception error) {
            call.reject("수집한 알림을 지우지 못했어요.", error);
        }
    }

    private static Set<String> toSet(JSONArray array) throws JSONException {
        Set<String> values = new HashSet<>();
        for (int index = 0; index < array.length(); index++) values.add(array.getString(index));
        return values;
    }
}
