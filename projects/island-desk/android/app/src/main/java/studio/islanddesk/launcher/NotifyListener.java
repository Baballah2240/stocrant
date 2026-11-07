package studio.islanddesk.launcher;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Lets Island show the phone's notifications (for example new email) on the home screen.
 * Android only connects this after the user turns on Island in Settings > Notification access.
 * Nothing is stored or sent anywhere; the home screen reads the live list when it needs it.
 */
public class NotifyListener extends NotificationListenerService {
    private static volatile NotifyListener connected;

    static NotifyListener get() { return connected; }

    @Override public void onListenerConnected() { connected = this; LauncherPlugin.notificationsChanged(); }
    @Override public void onListenerDisconnected() { if (connected == this) connected = null; }
    @Override public void onNotificationPosted(StatusBarNotification notification) { LauncherPlugin.notificationsChanged(); }
    @Override public void onNotificationRemoved(StatusBarNotification notification) { LauncherPlugin.notificationsChanged(); }
}
