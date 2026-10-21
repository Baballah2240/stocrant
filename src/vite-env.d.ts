/// <reference types="vite/client" />

/**
 * Build-time configuration for the native shells.
 *
 * A packaged app is served from capacitor:// or https://localhost, so a
 * relative "/api" resolves to nothing. Set this to your deployment's origin
 * when building the mobile apps:
 *
 *   VITE_API_BASE_URL=https://stocrant.example.com npm run mobile:build
 *
 * Users can override it per device from Settings → Mobile server connection.
 */
interface ImportMetaEnv {
  readonly VITE_PUBLIC_WEBSITE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
