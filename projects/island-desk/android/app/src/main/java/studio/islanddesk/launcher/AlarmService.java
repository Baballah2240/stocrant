package studio.islanddesk.launcher;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** Rings the alarm: alarm-volume sound on loop, vibration, and a full-screen alert over the lock screen. */
public class AlarmService extends Service {
    static final String ACTION_RING = "ring", ACTION_STOP = "stop", ACTION_SNOOZE = "snooze";
    private static final String CHANNEL = "island_alarms";
    private static final int NOTIFICATION = 4401;
    private static final long GIVE_UP_MS = 10 * 60 * 1000;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wake;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String currentId = "";
    private int snoozeMinutes = 10;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_STOP : intent.getAction();
        if (ACTION_SNOOZE.equals(action)) {
            AlarmStore.schedule(this, "snooze:" + currentId, System.currentTimeMillis() + snoozeMinutes * 60_000L);
            finishRinging(); return START_NOT_STICKY;
        }
        if (!ACTION_RING.equals(action)) { finishRinging(); return START_NOT_STICKY; }

        currentId = intent.getStringExtra("id");
        snoozeMinutes = Math.max(1, intent.getIntExtra("snooze", 10));
        String label = intent.getStringExtra("label");
        if (label == null || label.trim().isEmpty()) label = "Alarm";

        Intent screen = new Intent(this, AlarmActivity.class).putExtra("label", label).putExtra("snooze", snoozeMinutes)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent full = PendingIntent.getActivity(this, 1, screen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notice = new Notification.Builder(this, channel())
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(label).setContentText("Tap to open, or snooze / stop.")
            .setCategory(Notification.CATEGORY_ALARM).setFullScreenIntent(full, true).setContentIntent(full).setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "Snooze " + snoozeMinutes + " min", command(ACTION_SNOOZE, 2)).build())
            .addAction(new Notification.Action.Builder(null, "Stop", command(ACTION_STOP, 3)).build())
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIFICATION, notice);

        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "island:alarm");
        wake.acquire(GIVE_UP_MS + 5000);
        startSound();
        if (intent.getBooleanExtra("vibrate", true)) startVibration();
        try { startActivity(screen); } catch (Exception blocked) { /* the full-screen notification shows it instead */ }
        handler.postDelayed(this::finishRinging, GIVE_UP_MS);
        return START_NOT_STICKY;
    }

    private PendingIntent command(String action, int code) {
        return PendingIntent.getService(this, code, new Intent(this, AlarmService.class).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private String channel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Alarms", NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(null, null); // the service plays the alarm itself, at alarm volume
        channel.setBypassDnd(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
        return CHANNEL;
    }
    private void startSound() {
        Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (tone == null) tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, tone);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception failed) { player = null; }
    }
    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = { 0, 800, 600 };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0)); else vibrator.vibrate(pattern, 0);
    }
    private void finishRinging() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) { try { player.stop(); } catch (Exception ignored) { } player.release(); player = null; }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
        if (wake != null && wake.isHeld()) wake.release();
        AlarmActivity.closeIfOpen();
        stopForeground(true);
        stopSelf();
    }
    @Override public void onDestroy() { if (player != null) { player.release(); player = null; } if (vibrator != null) vibrator.cancel(); super.onDestroy(); }
}
