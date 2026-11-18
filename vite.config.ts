import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Excalidraw (drawing blocks) loads its canvas fonts at runtime from
// `window.EXCALIDRAW_ASSET_PATH` + `fonts/<Family>/<file>.woff2` and falls back to a CDN
// (esm.sh) when a file is missing. The app is offline-first, so the fonts ship with it:
// served straight from node_modules in dev, emitted as `dist/excalidraw/fonts/**` on build
// (nothing binary is versioned). The path is set in src/lib/drawing/excalidrawAssets.ts.
// Xiaolai (CJK, 12.7 MB) is left out on purpose.
const EXCALIDRAW_FONTS_DIR = path.resolve(__dirname, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const EXCALIDRAW_FONTS_URL = 'excalidraw/fonts'
const EXCALIDRAW_SKIPPED_FAMILIES = new Set(['Xiaolai'])

function listExcalidrawFonts(): string[] {
  const out: string[] = []
  for (const family of fs.readdirSync(EXCALIDRAW_FONTS_DIR, { withFileTypes: true })) {
    if (!family.isDirectory() || EXCALIDRAW_SKIPPED_FAMILIES.has(family.name)) continue
    for (const file of fs.readdirSync(path.join(EXCALIDRAW_FONTS_DIR, family.name))) {
      if (file.endsWith('.woff2')) out.push(`${family.name}/${file}`)
    }
  }
  return out
}

// Excalidraw 0.18 always appends a CDN copy (`https://esm.sh/@excalidraw/excalidraw@…/dist/prod/`)
// as the last source of every font face, with no option to turn it off. Under the app's CSP
// that never reaches the network, but Chromium checks every source when the face is created,
// so opening the canvas logged ~230 "Refused to load the font" violations. Point that
// fallback at the self-hosted path instead (a harmless duplicate of the first source).
//
// What a production build guarantees (generateBundle below): the rewrite was applied at least
// once AND no emitted script (chunks, and workers emitted as assets) mentions the CDN — so an Excalidraw upgrade that renames, moves or
// reshapes the fallback breaks `npm run build` instead of shipping it back. In dev the rewrite is
// best effort (Vite's pre-bundled copy); nothing checks it there.
const EXCALIDRAW_CDN = 'https://esm.sh/'
const EXCALIDRAW_CDN_FALLBACK = /`https:\/\/esm\.sh\/\$\{[\s\S]*?\}\/dist\/prod\/`/g
const EXCALIDRAW_LOCAL_FALLBACK = '(typeof window.EXCALIDRAW_ASSET_PATH==="string"?window.EXCALIDRAW_ASSET_PATH:window.location.href)'

function excalidrawFonts(): Plugin {
  let patched = 0
  return {
    name: 'noteflow:excalidraw-fonts',
    buildStart() {
      patched = 0
    },
    transform(code, id) {
      // Build: the package's own chunk. Dev: Vite's pre-bundled copy (node_modules/.vite/deps/chunk-*.js).
      if (!code.includes(EXCALIDRAW_CDN) || !(id.includes('@excalidraw/excalidraw') || id.includes('/.vite/deps/'))) return null
      let count = 0
      const out = code.replace(EXCALIDRAW_CDN_FALLBACK, () => { count++; return EXCALIDRAW_LOCAL_FALLBACK })
      if (count === 0) return null
      patched += count
      return { code: out, map: null }
    },
    configureServer(server) {
      const known = new Set(listExcalidrawFonts())
      server.middlewares.use(`/${EXCALIDRAW_FONTS_URL}`, (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        // Always answer here (never fall through to the SPA fallback, which would serve
        // index.html with a 200 for a missing font).
        if (!known.has(rel)) { res.statusCode = 404; res.end(); return }
        res.setHeader('Content-Type', 'font/woff2')
        fs.createReadStream(path.join(EXCALIDRAW_FONTS_DIR, rel)).pipe(res)
      })
    },
    generateBundle(_options, bundle) {
      if (patched === 0) {
        this.error('Excalidraw CDN font fallback was not rewritten in any module: update EXCALIDRAW_CDN_FALLBACK in vite.config.ts')
      }
      // Chunks, and the scripts emitted as assets (workers).
      for (const file of Object.values(bundle)) {
        const code = file.type === 'chunk' ? file.code
          : /\.m?js$/.test(file.fileName) ? (typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8'))
            : ''
        if (code.includes(EXCALIDRAW_CDN)) {
          this.error(`${file.fileName} still references ${EXCALIDRAW_CDN}: update EXCALIDRAW_CDN_FALLBACK in vite.config.ts`)
        }
      }
      for (const rel of listExcalidrawFonts()) {
        this.emitFile({
          type: 'asset',
          fileName: `${EXCALIDRAW_FONTS_URL}/${rel}`,
          source: fs.readFileSync(path.join(EXCALIDRAW_FONTS_DIR, rel)),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), excalidrawFonts()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Only the app's own entry: by default Vite scans every *.html under the root for
  // dependencies (docs/, supabase/email-templates, release/win-unpacked/LICENSES.chromium.html…).
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Don't watch what the renderer never imports. In the main checkout the initial crawl of
    // .claude/worktrees (a full copy of the repo each), release/, docs/ and the Electron dev
    // profile kept the dev server busy for about a minute: a blank window on every cold start.
    watch: {
      ignored: ['**/.claude/**', '**/release/**', '**/.electron-dev/**', '**/docs/**', '**/dist-electron/**'],
    },
  },
})
