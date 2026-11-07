import { registerPlugin } from "@capacitor/core";

/** Native side of the home-screen launcher (android/app/.../LauncherPlugin.java). */
export interface InstalledApp { label: string; packageName: string; activity: string; icon: string; system: boolean }
interface LauncherPlugin {
  listApps(): Promise<{ apps: InstalledApp[] }>;
  launch(options: { packageName: string; activity: string }): Promise<void>;
  isDefaultLauncher(): Promise<{ value: boolean }>;
  openHomeSettings(): Promise<void>;
  openAppInfo(options: { packageName: string }): Promise<void>;
}
export const Launcher = registerPlugin<LauncherPlugin>("Launcher");
