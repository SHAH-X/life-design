/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Injected at build time by vite.config.ts `define`.
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __COMMIT__: string
/** onnxruntime-web's version: names search by meaning's runtime file (public/models/ort-<version>/). */
declare const __ORT_VERSION__: string
