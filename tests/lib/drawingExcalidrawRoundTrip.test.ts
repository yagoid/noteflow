// @vitest-environment happy-dom
//
// The stored scene against Excalidraw itself: the line format leaves out Excalidraw's
// bookkeeping (version, versionNonce, updated, isDeleted) and rounds floats, and a scene
// is loaded back through Excalidraw's own `restore` (lib/drawing/drawingScene.ts →
// restoreScene). This checks, with the real package, that restore accepts what we store
// and that store → restore → store is a fixed point.

import { beforeAll, describe, expect, it } from 'vitest'
import { parseSceneBody, serializeSceneBody, type DrawingElement, type DrawingSceneData } from '../../src/lib/drawing/drawingBlock'
import { restoreScene, sceneToData } from '../../src/lib/drawing/drawingScene'

type Excalidraw = typeof import('@excalidraw/excalidraw')

// happy-dom has no canvas: Excalidraw probes a 2D context when its module loads and
// measures text with one. A stand-in that answers anything (text is 10 px per character).
let convertToExcalidrawElements: Excalidraw['convertToExcalidrawElements']
beforeAll(async () => {
  const context = new Proxy({ filter: 'none', font: '' } as Record<string, unknown>, {
    get: (target, key) => {
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 })
      return key in target ? target[key as string] : () => undefined
    },
    set: (target, key, value) => { target[key as string] = value; return true },
  })
  HTMLCanvasElement.prototype.getContext = (() => context) as never
  // …nor the FontFace API, which Excalidraw's font registry builds its faces with.
  ;(globalThis as Record<string, unknown>).FontFace ??= class {
    unicodeRange: string
    constructor(public family: string, public source: string, descriptors: { unicodeRange?: string } = {}) {
      this.unicodeRange = descriptors.unicodeRange ?? 'U+0-10FFFF'
    }
  }
  window.EXCALIDRAW_ASSET_PATH = 'http://localhost/excalidraw/'
  ;({ convertToExcalidrawElements } = await import('@excalidraw/excalidraw'))
})

/** store → Excalidraw: what the overlay and the preview load. */
const load = async (lines: string[]) => sceneToData(await restoreScene(parseSceneBody(lines)!))

/** A scene as Excalidraw makes it: full elements, float noise, bookkeeping fields. */
function sampleScene(): DrawingSceneData {
  const elements = convertToExcalidrawElements([
    { type: 'rectangle', id: 'box', x: 10.123456789, y: 20.987654321, width: 160.5000001, height: 70.3333333, label: { text: 'Idea' } },
    { type: 'ellipse', id: 'end', x: 400.111111, y: 30.222222, width: 120, height: 60, label: { text: 'Done' } },
    { type: 'arrow', x: 180, y: 55, start: { id: 'box' }, end: { id: 'end' }, label: { text: 'then' } },
    { type: 'text', x: 5.5555555, y: 200.4444444, text: 'A loose note\nsecond line' },
    { type: 'diamond', x: 0, y: 300, width: 80, height: 80, angle: 0.7853981633974483 as never },
    { type: 'line', x: 300, y: 300, points: [[0, 0], [33.3333333, 12.3456789], [80.1, -5.05]] as never },
  ])
  return { appState: { viewBackgroundColor: 'transparent' }, elements: elements as unknown as DrawingElement[], files: {} }
}

describe('stored scene ↔ Excalidraw restore', () => {
  it('restore fills back what the stored lines leave out', async () => {
    const lines = serializeSceneBody(sampleScene())
    for (const line of lines.slice(1)) {
      const el = JSON.parse(line) as Record<string, unknown>
      for (const key of ['version', 'versionNonce', 'updated', 'isDeleted']) expect(el, key).not.toHaveProperty(key)
    }
    const restored = await load(lines)
    expect(restored.elements.length).toBe(lines.length - 1)
    for (const el of restored.elements) {
      expect(el.version, el.id).toBeGreaterThan(0)
      expect(typeof el.versionNonce, el.id).toBe('number')
      expect(typeof el.updated, el.id).toBe('number')
      expect(el.isDeleted, el.id).toBe(false)
    }
  })

  it('what Excalidraw hands back is a fixed point: store → restore → store, again and again', async () => {
    // One pass through restore first: that is the state a scene is always written from
    // (the overlay loads through it). restore normalizes what convertToExcalidrawElements
    // builds — a line's origin point and size — which is Excalidraw's doing, not ours.
    const first = serializeSceneBody(await load(serializeSceneBody(sampleScene())))
    let lines = first
    for (let i = 0; i < 3; i++) {
      lines = serializeSceneBody(await load(lines))
      expect(lines).toEqual(first)
    }
  })

  it('keeps bindings, labels and geometry through the trip', async () => {
    const restored = await load(serializeSceneBody(sampleScene()))
    const of = (type: string) => restored.elements.filter((el) => el.type === type)
    const [box] = of('rectangle')
    const [end] = of('ellipse')
    const [arrow] = of('arrow')
    expect((arrow.startBinding as { elementId: string }).elementId).toBe(box.id)
    expect((arrow.endBinding as { elementId: string }).elementId).toBe(end.id)
    expect(of('text').map((el) => el.text)).toEqual(expect.arrayContaining(['Idea', 'Done', 'then', 'A loose note\nsecond line']))
    // Rounded, not mangled: 2 decimals of geometry, 4 of the angle.
    expect(box.x).toBe(10.12)
    expect(of('diamond')[0].angle).toBe(0.7854)
    expect(of('line')[0].points).toEqual([[0, 0], [33.33, 12.35], [80.1, -5.05]])
  })

  it('accepts a minimal hand-written scene, and measures a text written without its size', async () => {
    const restored = await load([
      '{"type":"excalidraw","version":2}',
      '{"id":"a","type":"rectangle","x":0,"y":0,"width":100,"height":50}',
      '{"id":"t","type":"text","x":10,"y":10,"text":"Hi","fontSize":20,"fontFamily":5}',
    ])
    expect(restored.elements.map((el) => el.type)).toEqual(['rectangle', 'text'])
    const text = restored.elements[1]
    expect(Number(text.width)).toBeGreaterThan(0)
    expect(Number(text.height)).toBeGreaterThan(0)
    const once = serializeSceneBody(restored)
    expect(serializeSceneBody(await load(once))).toEqual(once)
  })
})
