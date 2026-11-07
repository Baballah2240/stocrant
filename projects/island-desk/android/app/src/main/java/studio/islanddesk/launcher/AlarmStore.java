package studio.islanddesk.launcher;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Alarms live on the native side so they keep working when the app is closed or after a restart.
 * Each alarm: { id, hour, minute, days: [0=Sun..6=Sat] (empty = once), label, enabled, vibrate, snoozeMinutes }.
 */
public final class AlarmStore {
    static final String ACTION_FIRE = "studio.islanddesk.launcher.ALARM_FIRE";
    private AlarmStore() {}

    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences("island_alarms", Context.MODE_PRIVATE); }

    static synchronized JSONArray load(Context context) {
        try { return new JSONArray(prefs(context).getString("list", "[]")); } catch (JSONException broken) { return new JSONArray(); }
    }
    static synchronized void save(Context context, JSONArray alarms) { prefs(context).edit().putString("list", alarms.toString()).apply(); }

    static JSONObject find(JSONArray alarms, String id) {
        for (int i = 0; i < alarms.length(); i++) { JSONObject alarm = alarms.optJSONObject(i); if (alarm != null && id.equals(alarm.optString("id"))) return alarm; }
        return null;
    }

    /** The next moment this alarm should ring after `now`, or -1 if it is off. */
    static long next(JSONObject alarm, long now) {
        if (!alarm.optBoolean("enabled", true)) return -1;
        JSONArray days = alarm.optJSONArray("days");
        Calendar at = Calendar.getInstance();
        at.setTimeInMillis(now);
        at.set(Calendar.HOUR_OF_DAY, alarm.optInt("hour"));
        at.set(Calendar.MINUTE, alarm.optInt("minute"));
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        for (int i = 0; i < 8; i++) {
            if (at.getTimeInMillis() > now && (days == null || days.length() == 0 || contains(days, at.get(Calendar.DAY_OF_WEEK) - 1))) return at.getTimeInMillis();
            at.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }
    private static boolean contains(JSONArray days, int day) { for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == day) return true; return false; }

    /** Re-arm every alarm with Android. Uses setAlarmClock, which wakes the phone and survives Doze. */
    static void scheduleAll(Context context) {
        JSONArray alarms = load(context);
        long now = System.currentTimeMillis();
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject alarm = alarms.optJSONObject(i); if (alarm == null) continue;
            String id = alarm.optString("id");
            cancel(context, id);
            long at = next(alarm, now);
            if (at > 0) schedule(context, id, at);
        }
    }
    static void schedule(Context context, String key, long at) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent show = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        manager.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fire(context, key));
    }
    static void cancel(Context context, String key) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(fire(context, key));
    }
    private static PendingIntent fire(Context context, String key) {
        Intent intent = new Intent(context, AlarmReceiver.class).setAction(ACTION_FIRE).putExtra("key", key);
        return PendingIntent.getBroadcast(context, key.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static long nextOfAll(Context context) {
        JSONArray alarms = load(context); long best = -1, now = System.currentTimeMillis();
        for (int i = 0; i < alarms.length(); i++) { JSONObject alarm = alarms.optJSONObject(i); if (alarm == null) continue; long at = next(alarm, now); if (at > 0 && (best < 0 || at < best)) best = at; }
        return best;
    }
}
