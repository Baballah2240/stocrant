import type { CapacitorConfig } from "@capacitor/cli";

// `npm run mobile:apk:lan` supplies an http:// Wi-Fi API origin for a trusted
// developer LAN. Keep the normal/release configuration HTTPS-only.
const mobileWebUrl = process.env.STOCRANT_MOBILE_WEB_URL?.trim();
const localLanBuild = /^http:\/\//.test(mobileWebUrl || process.env.VITE_API_BASE_URL || "");

/**
 * STOCRANT native shell (Android + iOS).
 *
 * The app loads the built SPA from the device, so every API call needs an
 * absolute origin. Set VITE_API_BASE_URL at build time (or override the
 * SERVER_URL key at runtime via the in-app server settings) so a phone can
 * reach the deployment instead of assuming http://localhost:3000.
 *
 *   npm run mobile:sync -- -- --config-only   # regenerate natives only
 *   VITE_API_BASE_URL=https://stocrant.example.com npm run build:frontend
 */
const config: CapacitorConfig = {
  appId: "com.stocrant.app",
  appName: "STOCRANT",
  // Vite emits relative asset paths so the WebView can load from file://
  // (Android) and capacitor:// (iOS) without rewriting every URL.
  webDir: "dist/web",
  bundledWebRuntime: false,
  server: {
    // Optional live development connection; normal builds use bundled assets.
    ...(mobileWebUrl ? { url: mobileWebUrl } : {}),
    androidScheme: "https",
    iosScheme: "capacitor",
    // Enabled only by the debug LAN builder; production uses HTTPS.
    cleartext: localLanBuild,
  },
  android: {
    // Keep the keyboard from covering inputs on small screens.
    // The Android WebView itself uses https://localhost; its local HTTP API is
    // mixed content during trusted LAN debug testing only.
    allowMixedContent: localLanBuild,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: "#0b1220",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b1220",
    },
  },
};

export default config;
