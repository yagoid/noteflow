// Bundles the app's real brain scene into brain.js. Run from the repo root: node prototypes/agents-view/build.mjs
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [path.join(here, 'entry.jsx')], bundle: true, minify: true, format: 'iife',
  outfile: path.join(here, 'brain.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
  plugins: [{ name: 'noteflow-prototype', setup(b) {
    b.onResolve({ filter: /stores\/themeStore$/ }, () => ({ path: path.join(here, 'theme-stub.js') }))
    // The scene only exposes its debug handle (camera, controls, node data) behind a localStorage key;
    // the prototype needs it always, to anchor the synapses to the nodes.
    b.onLoad({ filter: /BrainScene\.tsx$/ }, (a) => {
      const src = fs.readFileSync(a.path, 'utf8')
      if (!src.includes('if (debugEnabled())')) throw new Error('BrainScene: debug hook not found')
      return { contents: src.replace('if (debugEnabled())', 'if (true)'), loader: 'tsx' }
    })
  } }],
})
console.log('brain.js', fs.statSync(path.join(here, 'brain.js')).size, 'bytes')
