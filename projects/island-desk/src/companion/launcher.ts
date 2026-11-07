import { registerPlugin } from "@capacitor/core";

/** Native side of the home-screen launcher (android/app/.../LauncherPlugin.java). */
export interface Alarm { id: string; hour: number; minute: number; days: number[]; label: string; enabled: boolean; vibrate: boolean; snoozeMinutes: number }
export interface AlarmList { alarms: Alarm[]; next: number }
export interface PhoneNotification { key: string; packageName: string; app: string; title: string; text: string; time: number; category: string; icon: string }
export interface InstalledApp { label: string; packageName: string; activity: string; icon: string; system: boolean }
interface LauncherPlugin {
  listApps(): Promise<{ apps: InstalledApp[] }>;
  launch(options: { packageName: string; activity: string }): Promise<void>;
  isDefaultLauncher(): Promise<{ value: boolean }>;
  openHomeSettings(): Promise<void>;
  openAppInfo(options: { packageName: string }): Promise<void>;
  getAlarms(): Promise<AlarmList>;
  saveAlarm(options: { alarm: Alarm }): Promise<AlarmList>;
  deleteAlarm(options: { id: string }): Promise<AlarmList>;
  testAlarm(options: { id: string }): Promise<void>;
  ensureAlarmPermissions(): Promise<void>;
  setKeepAwake(options: { value: boolean }): Promise<void>;
  notificationAccess(): Promise<{ granted: boolean }>;
  openNotificationAccess(): Promise<void>;
  getNotifications(): Promise<{ granted: boolean; connecting?: boolean; notifications: PhoneNotification[] }>;
  openNotification(options: { key: string }): Promise<void>;
  dismissNotification(options: { key: string }): Promise<void>;
  openUrl(options: { url: string }): Promise<void>;
  deviceName(): Promise<{ name: string }>;
  discover(options: { timeoutMs?: number }): Promise<{ computers: { host: string; port: number; id: string }[] }>;
  addListener(event: "notificationsChanged", handler: () => void): Promise<{ remove: () => Promise<void> }>;
}
export const Launcher = registerPlugin<LauncherPlugin>("Launcher");
