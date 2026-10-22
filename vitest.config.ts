import { defineConfig } from 'vitest/config'

// Tests live in tests/ (outside src/ and electron/) so they never leak into
// dist/ or dist-electron/. Most of the covered logic is node-safe, so the
// default environment is node. A test that needs a DOM (the md ↔ editor round
// trip on the real TipTap schema, tests/lib/editorRoundTrip.test.ts) opts in
// per file with a `// @vitest-environment happy-dom` comment.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
