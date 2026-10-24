/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from https://shah-x.github.io/life-design/
const BASE = '/life-design/'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const ort = JSON.parse(readFileSync(new URL('./node_modules/onnxruntime-web/package.json', import.meta.url), 'utf8')) as { version: string }
const meaningModel = JSON.parse(readFileSync(new URL('./src/lib/meaning-model.json', import.meta.url), 'utf8')) as {
  dir: string
  files: { name: string }[]
}
const ocrModel = JSON.parse(readFileSync(new URL('./src/lib/ocr-model.json', import.meta.url), 'utf8')) as { dir: string }

// Content-Security-Policy for the built app only (Vite's dev server needs inline scripts).
// connect-src: only this site and the AI services you can choose (Groq, OpenAI), called directly from the phone with
// your own key. Nothing else can be reached, so not even injected code could send the key or your journal elsewhere.
// script-src 'self' blocks WebAssembly on the page. Search by meaning's and reading photos' models run WebAssembly in
// workers, which don't take this <meta> policy: each fetches only its own files (src/lib/meaning.worker.ts,
// src/lib/ocr.worker.ts).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.groq.com https://api.openai.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'life-design:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

// The on-phone models' files (search by meaning, reading photos) are git-ignored (npm run model fetches and checks
// them). A build without them would publish features that can't start, so it refuses instead.
function meaningModelFiles(): Plugin {
  return {
    name: 'life-design:meaning-model',
    apply: 'build',
    buildStart() {
      const needed = [
        ...meaningModel.files.map((f) => `${meaningModel.dir}/${f.name}.gz`),
        ...['det.onnx', 'rec.onnx', 'dict.json'].map((name) => `${ocrModel.dir}/${name}.gz`),
        `ort-${ort.version}/ort.wasm.gz`,
      ]
      const missing = needed.filter((path) => !existsSync(new URL(`./public/models/${path}`, import.meta.url)))
      if (missing.length) this.error(`The on-phone models' files are missing (public/models/${missing.join(', ')}). Run npm run model first.`)
    },
  }
}

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify(commitSha()),
    __ORT_VERSION__: JSON.stringify(ort.version),
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    contentSecurityPolicy(),
    meaningModelFiles(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE,
        name: 'Life Design',
        short_name: 'Life Design',
        description: 'A private daily journal for designing your life.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#f6f4ef',
        theme_color: '#f6f4ef',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' },
  },
})
