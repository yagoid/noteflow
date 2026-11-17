import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
