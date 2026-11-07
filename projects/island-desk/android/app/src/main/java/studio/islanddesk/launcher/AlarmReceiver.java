package studio.islanddesk.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Android calls this at alarm time (and after a reboot or clock change, to re-arm everything). */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!AlarmStore.ACTION_FIRE.equals(action)) { AlarmStore.scheduleAll(context); return; }

        String key = intent.getStringExtra("key");
        if (key == null) return;
        String id = key.startsWith("snooze:") ? key.substring(7) : key;
        JSONArray alarms = AlarmStore.load(context);
        JSONObject alarm = AlarmStore.find(alarms, id);
        if (alarm == null) return;

        // A one-time alarm switches itself off after ringing; repeating ones move to their next day.
        if (!key.startsWith("snooze:")) {
            JSONArray days = alarm.optJSONArray("days");
            if (days == null || days.length() == 0) { try { alarm.put("enabled", false); } catch (Exception ignored) { } AlarmStore.save(context, alarms); }
            AlarmStore.scheduleAll(context);
        }

        Intent ring = new Intent(context, AlarmService.class).setAction(AlarmService.ACTION_RING)
            .putExtra("id", id).putExtra("label", alarm.optString("label"))
            .putExtra("vibrate", alarm.optBoolean("vibrate", true)).putExtra("snooze", alarm.optInt("snoozeMinutes", 10));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(ring); else context.startService(ring);
    }
}
