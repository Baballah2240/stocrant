package studio.islanddesk.launcher;

import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.util.LruCache;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.net.wifi.WifiManager;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import android.app.Notification;
import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationManagerCompat;
import android.app.AlarmManager;
import android.os.Build;
import android.view.WindowManager;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/** Home-screen features: list installed apps, open them, and manage the default home app. */
@CapacitorPlugin(name = "Launcher")
public class LauncherPlugin extends Plugin {
    private static final int ICON_SIZE = 108;
    private final LruCache<String, String> icons = new LruCache<>(400);
    private static volatile LauncherPlugin active;

    @Override public void load() { active = this; }
    /** Called by NotifyListener; the page then asks for the fresh list. */
    static void notificationsChanged() { LauncherPlugin plugin = active; if (plugin != null) plugin.notifyListeners("notificationsChanged", new JSObject()); }

    @PluginMethod
    public void listApps(PluginCall call) {
        // Icons are rendered off the UI thread; a phone with 150 apps takes a moment the first time.
        getBridge().execute(() -> {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
            String self = getContext().getPackageName();
            JSArray apps = new JSArray();
            for (ResolveInfo info : found) {
                String pkg = info.activityInfo.packageName;
                if (pkg.equals(self)) continue;
                String key = pkg + "/" + info.activityInfo.name;
                String icon = icons.get(key);
                if (icon == null) { icon = encode(info.loadIcon(pm)); icons.put(key, icon); }
                JSObject app = new JSObject();
                app.put("label", String.valueOf(info.loadLabel(pm)));
                app.put("packageName", pkg);
                app.put("activity", info.activityInfo.name);
                app.put("icon", icon);
                // Preinstalled apps (including updated ones) count as system apps.
                int flags = info.activityInfo.applicationInfo.flags;
                app.put("system", (flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0);
                apps.put(app);
            }
            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("packageName"), activity = call.getString("activity");
        if (pkg == null || activity == null) { call.reject("Missing app."); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(new ComponentName(pkg, activity))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("That app couldn't be opened. It may have been uninstalled.");
        }
    }

    @PluginMethod
    public void isDefaultLauncher(PluginCall call) {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo info = getContext().getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        JSObject result = new JSObject();
        result.put("value", info != null && info.activityInfo != null && getContext().getPackageName().equals(info.activityInfo.packageName));
        call.resolve(result);
    }

    @PluginMethod
    public void openHomeSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception notAvailable) {
            // Some phones (including several Huawei builds) only offer this under Default apps.
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppInfo(PluginCall call) {
        String pkg = call.getString("packageName");
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    /* ── Alarms ── */
    @PluginMethod
    public void getAlarms(PluginCall call) {
        JSObject result = new JSObject();
        try { result.put("alarms", new JSArray(AlarmStore.load(getContext()).toString())); } catch (Exception e) { result.put("alarms", new JSArray()); }
        result.put("next", AlarmStore.nextOfAll(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void saveAlarm(PluginCall call) {
        JSObject input = call.getObject("alarm");
        if (input == null) { call.reject("Missing alarm."); return; }
        try {
            String id = input.getString("id");
            int hour = input.getInteger("hour", 7), minute = input.getInteger("minute", 0);
            if (id == null || id.isEmpty() || hour < 0 || hour > 23 || minute < 0 || minute > 59) { call.reject("That alarm time is not valid."); return; }
            JSONObject alarm = new JSONObject();
            alarm.put("id", id); alarm.put("hour", hour); alarm.put("minute", minute);
            JSONArray days = new JSONArray(); JSONArray given = input.optJSONArray("days");
            if (given != null) for (int i = 0; i < given.length(); i++) { int d = given.optInt(i, -1); if (d >= 0 && d <= 6) days.put(d); }
            alarm.put("days", days);
            String label = input.optString("label", ""); alarm.put("label", label.length() > 60 ? label.substring(0, 60) : label);
            alarm.put("enabled", input.optBoolean("enabled", true));
            alarm.put("vibrate", input.optBoolean("vibrate", true));
            alarm.put("snoozeMinutes", Math.max(1, Math.min(30, input.optInt("snoozeMinutes", 10))));
            JSONArray alarms = AlarmStore.load(getContext()), next = new JSONArray(); boolean replaced = false;
            for (int i = 0; i < alarms.length(); i++) { JSONObject old = alarms.optJSONObject(i); if (old == null) continue; if (id.equals(old.optString("id"))) { next.put(alarm); replaced = true; } else next.put(old); }
            if (!replaced) next.put(alarm);
            AlarmStore.save(getContext(), next);
            AlarmStore.scheduleAll(getContext());
            getAlarms(call);
        } catch (Exception error) { call.reject("The alarm could not be saved."); }
    }

    @PluginMethod
    public void deleteAlarm(PluginCall call) {
        String id = call.getString("id", "");
        AlarmStore.cancel(getContext(), id); AlarmStore.cancel(getContext(), "snooze:" + id);
        JSONArray alarms = AlarmStore.load(getContext()), next = new JSONArray();
        for (int i = 0; i < alarms.length(); i++) { JSONObject old = alarms.optJSONObject(i); if (old != null && !id.equals(old.optString("id"))) next.put(old); }
        AlarmStore.save(getContext(), next);
        getAlarms(call);
    }

    /** Rings an existing alarm in a few seconds so you can hear it. */
    @PluginMethod
    public void testAlarm(PluginCall call) {
        String id = call.getString("id", "");
        if (AlarmStore.find(AlarmStore.load(getContext()), id) == null) { call.reject("Save the alarm first."); return; }
        AlarmStore.schedule(getContext(), "snooze:" + id, System.currentTimeMillis() + 5000);
        call.resolve();
    }

    /** Notifications (Android 13+) and exact alarms (Android 12+) must be allowed for alarms to ring. */
    @PluginMethod
    public void ensureAlarmPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            getActivity().requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4402);
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager manager = (AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            if (!manager.canScheduleExactAlarms()) getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
        }
        call.resolve();
    }

    /** Keep the screen on while the clock is showing (bedside or desk clock). */
    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("value", false));
        getActivity().runOnUiThread(() -> { if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        call.resolve();
    }

    /* ── Notifications (needs Settings > Notification access) ── */
    @PluginMethod
    public void notificationAccess(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationAccess(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    /** Current notifications, newest first. Ongoing ones (music, downloads) and Island's own are left out. */
    @PluginMethod
    public void getNotifications(PluginCall call) {
        NotifyListener listener = NotifyListener.get();
        JSArray list = new JSArray();
        if (listener != null) {
            try {
                StatusBarNotification[] active = listener.getActiveNotifications();
                PackageManager pm = getContext().getPackageManager();
                java.util.Arrays.sort(active, (a, b) -> Long.compare(b.getPostTime(), a.getPostTime()));
                for (StatusBarNotification item : active) {
                    Notification n = item.getNotification();
                    if (item.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || item.getPackageName().equals(getContext().getPackageName())) continue;
                    Bundle extras = n.extras;
                    CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE), text = extras.getCharSequence(Notification.EXTRA_TEXT), big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
                    if (title == null && text == null) continue;
                    JSObject row = new JSObject();
                    row.put("key", item.getKey());
                    row.put("packageName", item.getPackageName());
                    String label = item.getPackageName();
                    try { label = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(item.getPackageName(), 0))); } catch (Exception ignored) { }
                    row.put("app", label);
                    row.put("title", title == null ? "" : title.toString());
                    row.put("text", (big != null ? big : text == null ? "" : text).toString());
                    row.put("time", item.getPostTime());
                    row.put("category", n.category == null ? "" : n.category);
                    String icon = icons.get("app:" + item.getPackageName());
                    if (icon == null) { try { icon = encode(pm.getApplicationIcon(item.getPackageName())); } catch (Exception e) { icon = ""; } icons.put("app:" + item.getPackageName(), icon); }
                    row.put("icon", icon);
                    list.put(row);
                    if (list.length() >= 40) break;
                }
            } catch (Exception ignored) { }
        }
        boolean allowed = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        // After an update Android may leave the listener disconnected; ask it to reconnect.
        if (allowed && listener == null) { try { android.service.notification.NotificationListenerService.requestRebind(new ComponentName(getContext(), NotifyListener.class)); } catch (Exception ignored) { } }
        JSObject result = new JSObject();
        result.put("granted", allowed);
        result.put("connecting", allowed && listener == null);
        result.put("notifications", list);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotification(PluginCall call) {
        NotifyListener listener = NotifyListener.get();
        String key = call.getString("key", "");
        if (listener != null) for (StatusBarNotification item : listener.getActiveNotifications()) {
            if (!item.getKey().equals(key)) continue;
            try {
                if (item.getNotification().contentIntent != null) item.getNotification().contentIntent.send();
                else { Intent open = getContext().getPackageManager().getLaunchIntentForPackage(item.getPackageName()); if (open != null) getActivity().startActivity(open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                if ((item.getNotification().flags & Notification.FLAG_AUTO_CANCEL) != 0) listener.cancelNotification(item.getKey());
            } catch (Exception error) { call.reject("That notification can no longer be opened."); return; }
            call.resolve(); return;
        }
        call.reject("That notification is gone.");
    }

    @PluginMethod
    public void dismissNotification(PluginCall call) {
        NotifyListener listener = NotifyListener.get();
        if (listener != null) listener.cancelNotification(call.getString("key", ""));
        call.resolve();
    }

    @PluginMethod
    public void deviceName(PluginCall call) {
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER, model = Build.MODEL == null ? "" : Build.MODEL;
        String name = model.toLowerCase().startsWith(maker.toLowerCase()) ? model : (maker.isEmpty() ? model : maker.substring(0, 1).toUpperCase() + maker.substring(1) + " " + model);
        JSObject result = new JSObject(); result.put("name", name.trim().isEmpty() ? "Android phone" : name.trim()); call.resolve(result);
    }

    /** Listens briefly for Island Desk computers announcing themselves on this Wi-Fi. */
    @PluginMethod
    public void discover(PluginCall call) {
        int timeout = Math.max(500, Math.min(8000, call.getInt("timeoutMs", 3000)));
        getBridge().execute(() -> {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(android.content.Context.WIFI_SERVICE);
            WifiManager.MulticastLock lock = wifi == null ? null : wifi.createMulticastLock("island-discovery");
            JSArray found = new JSArray(); java.util.HashSet<String> seen = new java.util.HashSet<>();
            if (lock != null) lock.acquire();
            try (DatagramSocket socket = new DatagramSocket(null)) {
                socket.setReuseAddress(true); socket.setBroadcast(true); socket.bind(new InetSocketAddress(47821)); socket.setSoTimeout(400);
                byte[] buffer = new byte[512]; long end = System.currentTimeMillis() + timeout;
                while (System.currentTimeMillis() < end) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buffer, buffer.length); socket.receive(packet);
                        JSONObject beacon = new JSONObject(new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8));
                        if (!"island-desk".equals(beacon.optString("app"))) continue;
                        String hostIp = packet.getAddress().getHostAddress(), id = beacon.optString("id"); int port = beacon.optInt("port", 47820);
                        if (!seen.add(id + "@" + hostIp + ":" + port)) continue;
                        JSObject row = new JSObject(); row.put("host", hostIp); row.put("port", port); row.put("id", id); found.put(row);
                    } catch (SocketTimeoutException wait) { /* keep listening */ } catch (Exception ignored) { }
                }
            } catch (Exception error) { /* no Wi-Fi or port busy: report what we have */ }
            finally { if (lock != null && lock.isHeld()) lock.release(); }
            JSObject result = new JSObject(); result.put("computers", found); call.resolve(result);
        });
    }

    /** Opens a web page (for example a news story) in the phone's browser. Only http(s). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) { call.reject("Only web links can be opened."); return; }
        getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }

    private static String encode(Drawable drawable) {
        Bitmap bitmap = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, ICON_SIZE, ICON_SIZE);
        drawable.draw(canvas);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        bitmap.recycle();
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
