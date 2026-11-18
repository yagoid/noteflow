// @vitest-environment happy-dom
//
// Drawing blocks through the editor's REAL schema (editorExtensions.ts) and the
// app's pipeline (helpers/editorPipeline.ts): load = htmlFromMarkdown →
// ProseMirror parse, save = getHTML → htmlToMarkdown. The schema node
// (components/Editor/DrawingBlock.ts) exists so that opening and saving a note
// with a drawing never loses it — which is what this file guards.

import { describe, expect, it } from 'vitest'
import { DRAWING_NODE_NAME } from '../../src/components/Editor/DrawingBlock'
import { load, save } from '../helpers/editorPipeline'

const F = '```'
const SOURCE = ['<!-- drawing height="320" -->', `${F}mermaid`, 'flowchart TD', '  A["<b>x</b> & y"] --> B', '', '  B --> C', F, '<!-- /drawing -->'].join('\n')
const SCENE = [
  '<!-- drawing -->',
  `${F}excalidraw`,
  '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}',
  '{"id":"a","type":"rectangle","x":10.5,"y":20,"width":120,"height":60,"seed":1}',
  '{"id":"t","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":"a","text":"Idea \\"q\\" <tag>\\nline"}',
  F,
  '<!-- /drawing -->',
].join('\n')

const nodeTypes = (md: string) => {
  const types: string[] = []
  load(md).forEach((node) => { types.push(node.type.name) })
  return types
}

describe('drawing blocks in the editor schema', () => {
  it('load as one atom node each and save byte for byte', () => {
    for (const md of [SOURCE, SCENE]) {
      expect(nodeTypes(md)).toEqual([DRAWING_NODE_NAME])
      expect(save(load(md))).toBe(md)
    }
  })

  it('keep their place among other blocks', () => {
    const md = `# Title\n\ntext\n\n${SOURCE}\n\n- [ ] task\n\n${SCENE}\n\n| a | b |\n| --- | --- |\n| 1 | 2 |`
    expect(nodeTypes(md).filter((t) => t === DRAWING_NODE_NAME)).toHaveLength(2)
    const once = save(load(md))
    expect(once).toBe(md)
    expect(save(load(once))).toBe(once)
  })

  it('an invalid block is ordinary text and code in the editor, and survives the save', () => {
    const broken = SCENE.replace('"seed":1}', '"seed":1')
    expect(nodeTypes(broken)).not.toContain(DRAWING_NODE_NAME)
    const once = save(load(broken))
    for (const line of broken.split('\n')) expect(once.split('\n')).toContain(line)
    expect(save(load(once))).toBe(once)
  })

  it('a quoted block is not a drawing node', () => {
    // Top level only, like boards: in a quote the markers and the fence stay quoted text.
    expect(nodeTypes(`> ${SOURCE.split('\n').join('\n> ')}`)).not.toContain(DRAWING_NODE_NAME)
  })
})
