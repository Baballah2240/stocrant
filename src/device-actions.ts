import { Capacitor, registerPlugin } from "@capacitor/core";

const device = registerPlugin<{
  saveFile(input: { name: string; type: string; data: string }): Promise<{ cancelled: boolean }>;
  openWebsite(input: { url: string }): Promise<void>;
  pushReady(): Promise<{ configured: boolean }>;
  printPage(): Promise<void>;
  setAppearance(input: { dark: boolean }): Promise<void>;
}>("StocrantDevice");

export const isAndroidDevice = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** Fetch protected files in the workspace first; only file bytes reach the native save dialog. */
export async function saveDownload(blob: Blob, name: string): Promise<void> {
  if (isAndroidDevice()) {
    if (blob.size > 20 * 1024 * 1024) throw new Error("File is too large to save on this device.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read the downloaded file."));
      reader.readAsDataURL(blob);
    });
    await device.saveFile({ name, type: blob.type || "application/octet-stream", data });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function printPage(): Promise<void> {
  if (isAndroidDevice()) await device.printPage();
  else window.print();
}

export const openDeviceWebsite = (url: string) => device.openWebsite({ url });
export const hasNativePushSetup = async () => isAndroidDevice() && (await device.pushReady()).configured;

export async function syncDeviceAppearance(theme: "light" | "dark"): Promise<void> {
  if (isAndroidDevice()) await device.setAppearance({ dark: theme === "dark" });
}
