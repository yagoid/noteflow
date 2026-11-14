// How the web's copies of the app's pure brain modules are made (shared by build-brain.mjs, which
// writes them, and the app's test tests/components/brainWebSync.test.ts, which checks them).
//
// A copy is the app's module with a "GENERATED" header and its relative imports pointed at the
// web-side names; nothing else changes. A module that imports a package, imports dynamically or
// requires anything is refused: the copies must stay pure, self-contained TypeScript.

/** app module (src/components/Brain/) → its copy (docs/src/brain/) */
export const COPIES = {
  'brainMesh.ts': 'mesh.ts',
  'assignVertices.ts': 'assign.ts',
  'brainData.ts': 'data.ts',
  'brainBuffers.ts': 'buffers.ts',
  'brainLook.ts': 'look.ts',
  'brainShaders.ts': 'shaders.ts',
}

/** relative imports the copies may have, and where they point on the web side */
export const IMPORTS = {
  './brainMesh': './mesh',
  './assignVertices': './assign',
  './brainData': './data',
  './brainBuffers': './buffers',
  './brainLook': './look',
  './brainShaders': './shaders',
  './useBrainGraph': './graph', // types only: the web keeps its own copy of the graph model types
}

/** CRLF → LF (a checkout with core.autocrlf must not count as a difference). */
export const lf = (s) => s.replace(/\r\n/g, '\n')

/** The web copy of the app module `from` (a key of COPIES) whose source is `src`. */
export function toWebCopy(from, src) {
  const body = lf(src)
  if (/\bimport\s*\(/.test(body) || /\brequire\s*\(/.test(body)) {
    throw new Error(`${from}: dynamic import() or require() — the copies must stay pure`)
  }
  const rewritten = body.replace(/(\bfrom\s+)(['"])([^'"]+)\2/g, (_match, kw, quote, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${from}: unexpected package import '${spec}' (the copies must stay pure)`)
    const mapped = IMPORTS[spec]
    if (!mapped) throw new Error(`${from}: no web mapping for import '${spec}' (add it to IMPORTS in docs/scripts/brain-sync.mjs)`)
    return `${kw}${quote}${mapped}${quote}`
  })
  // a side-effect import (`import './x'`) has no `from`: refuse it too
  if (/^\s*import\s+['"]/m.test(rewritten)) throw new Error(`${from}: side-effect import — the copies must stay pure`)
  const header =
    `// GENERATED — copied from src/components/Brain/${from} by docs/scripts/build-brain.mjs.\n` +
    `// Do not edit here: change the app's module and run \`npm run brain\` in docs/.\n\n`
  return header + rewritten
}
