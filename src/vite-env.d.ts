/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** The app's public address on a host other than GitHub Pages (src/config.ts). */
  readonly VITE_APP_URL?: string
}

// Injected at build time by vite.config.ts `define`.
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __COMMIT__: string
