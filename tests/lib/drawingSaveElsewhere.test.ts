import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NoteSection } from '../../src/types'
import type { DrawingHtmlData } from '../../src/lib/drawing/drawingBlock'

// The save of a drawing that can't go through its live editor node
// (stores/drawingEditorStore.ts → saveDrawingElsewhere): whatever happens — the block
// changed, the section is gone, the disk write throws, the clipboard refuses — the drawing
// is only lost if the user explicitly discards it. The notes store is replaced by a
// stand-in holding one section.

const F = '```'
const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const el = (id: string, x: number) => `{"id":"${id}","type":"rectangle","x":${x},"y":0,"width":10,"height":10}`
const block = (lines: string[]) => ['<!-- drawing -->', `${F}excalidraw`, HEADER, ...lines, F, '<!-- /drawing -->'].join('\n')
const data = (lines: string[]): DrawingHtmlData => ({ kind: 'excalidraw', attrs: '', body: [HEADER, ...lines].join('\n') })

const disk = vi.hoisted(() => ({ sections: [] as { id: string; content: string }[], failWrites: 0, writes: 0 }))

vi.mock('../../src/stores/notesStore', () => ({
  useNotesStore: {
    getState: () => ({
      mutateSections: async (_noteId: string, fn: (s: NoteSection[]) => NoteSection[] | null) => {
        const next = fn(disk.sections as NoteSection[])
        if (!next) return
        if (disk.failWrites > 0) { disk.failWrites--; throw new Error('EACCES: disk write failed') }
        disk.writes++
        disk.sections = next
      },
    }),
  },
}))
vi.mock('../../src/lib/pendingEdits', () => ({ flushPendingEdits: () => undefined }))

const { flushOpenDrawing, saveDrawingElsewhere, useDrawingEditorStore } = await import('../../src/stores/drawingEditorStore')

const OPENED = data([el('a', 1)])
const DRAWN = data([el('a', 1), el('mine', 9)])
const target = { noteId: 'n', sectionId: 's', opened: OPENED, ordinal: 0 }
const content = () => disk.sections[0]?.content

/** Answers every prompt as scripted (true = first option) and records what was asked. */
function answer(script: Record<string, boolean[]>) {
  const asked: string[] = []
  const unsubscribe = useDrawingEditorStore.subscribe((s) => {
    if (!s.prompt) return
    asked.push(s.prompt.kind)
    const next = script[s.prompt.kind]?.shift() ?? false
    queueMicrotask(() => s.prompt?.resolve(next))
  })
  return { asked, unsubscribe }
}

let clipboard: string[] = []
let clipboardFails = 0
beforeEach(() => {
  disk.sections = [{ id: 's', content: `Intro\n\n${block([el('a', 1)])}\n\nEnd` }]
  disk.failWrites = 0
  disk.writes = 0
  clipboard = []
  clipboardFails = 0
  vi.stubGlobal('navigator', { clipboard: { writeText: async (t: string) => { if (clipboardFails > 0) { clipboardFails--; throw new Error('denied') } clipboard.push(t) } } })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  useDrawingEditorStore.setState({ available: true, session: null, prompt: null, pending: null, snapshot: null })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('saveDrawingElsewhere', () => {
  it('writes into the block that is still the opened one, asking nothing', async () => {
    const a = answer({})
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual([])
    expect(content()).toBe(`Intro\n\n${block([el('a', 1), el('mine', 9)])}\n\nEnd`)
  })

  it('block changed meanwhile: asks, and inserts the drawing as a new block (the other one untouched)', async () => {
    disk.sections = [{ id: 's', content: `Intro\n\n${block([el('a', 77)])}\n\nEnd` }]
    const a = answer({ changed: [true] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['changed'])
    expect(content()).toBe(`Intro\n\n${block([el('a', 77)])}\n\nEnd\n\n${block([el('a', 1), el('mine', 9)])}`)
  })

  it('block changed and the user discards: nothing is written', async () => {
    disk.sections = [{ id: 's', content: 'No drawing here any more' }]
    const a = answer({ changed: [false] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['changed'])
    expect(content()).toBe('No drawing here any more')
    expect(clipboard).toEqual([])
  })

  it('section gone: asks, and copies the drawing as markdown', async () => {
    disk.sections = []
    const a = answer({ gone: [true] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['gone'])
    expect(clipboard).toEqual([block([el('a', 1), el('mine', 9)])])
  })

  it('the disk write throws: the user is told and can try again', async () => {
    disk.failWrites = 2
    const a = answer({ 'write-failed': [true, true] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['write-failed', 'write-failed'])
    expect(content()).toContain(el('mine', 9))
  })

  it('the disk write keeps failing: copy instead', async () => {
    disk.failWrites = 99
    const a = answer({ 'write-failed': [false] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['write-failed'])
    expect(clipboard).toEqual([block([el('a', 1), el('mine', 9)])])
    expect(content()).not.toContain('mine')
  })

  it('the clipboard fails too: it is said, retried, and only an explicit discard loses the drawing', async () => {
    disk.failWrites = 99
    clipboardFails = 1
    const a = answer({ 'write-failed': [false], 'copy-failed': [true] })
    await saveDrawingElsewhere(target, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['write-failed', 'copy-failed'])
    expect(clipboard).toHaveLength(1)

    clipboard = []
    clipboardFails = 99
    const b = answer({ 'write-failed': [false], 'copy-failed': [true, false] })
    await saveDrawingElsewhere(target, DRAWN)
    b.unsubscribe()
    expect(b.asked).toEqual(['write-failed', 'copy-failed', 'copy-failed'])
    expect(clipboard).toEqual([])
  })

  it('without a target (no note behind the editor) the drawing is offered as a copy', async () => {
    const a = answer({ gone: [true] })
    await saveDrawingElsewhere(null, DRAWN)
    a.unsubscribe()
    expect(a.asked).toEqual(['gone'])
    expect(clipboard).toHaveLength(1)
  })
})

describe('flushOpenDrawing (the window closes)', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('writes the open canvas into its block', async () => {
    useDrawingEditorStore.setState({
      session: { block: { kind: 'mermaid', attrs: '', source: '' }, scene: { elements: [], appState: {}, files: {} }, target, finish: () => undefined },
      snapshot: () => ({ lines: DRAWN.body.split('\n'), empty: false }),
    })
    flushOpenDrawing()
    await settle()
    expect(content()).toContain(el('mine', 9))
  })

  it('does nothing when the user changed nothing', async () => {
    useDrawingEditorStore.setState({
      session: { block: { kind: 'mermaid', attrs: '', source: '' }, scene: { elements: [], appState: {}, files: {} }, target, finish: () => undefined },
      snapshot: () => null,
    })
    flushOpenDrawing()
    await settle()
    expect(disk.writes).toBe(0)
  })

  it('with a question still unanswered, keeps the finished drawing as a new block', async () => {
    disk.sections = [{ id: 's', content: `Intro\n\n${block([el('a', 77)])}` }]
    const pending = saveDrawingElsewhere(target, DRAWN) // stops at the 'changed' question
    await settle()
    expect(useDrawingEditorStore.getState().prompt?.kind).toBe('changed')
    flushOpenDrawing()
    await settle()
    expect(content()).toBe(`Intro\n\n${block([el('a', 77)])}\n\n${block([el('a', 1), el('mine', 9)])}`)
    useDrawingEditorStore.getState().prompt?.resolve(false)
    await pending
  })

  it('a failing write on close throws nothing', async () => {
    disk.failWrites = 99
    useDrawingEditorStore.setState({
      session: { block: { kind: 'mermaid', attrs: '', source: '' }, scene: { elements: [], appState: {}, files: {} }, target, finish: () => undefined },
      snapshot: () => ({ lines: DRAWN.body.split('\n'), empty: false }),
    })
    expect(() => flushOpenDrawing()).not.toThrow()
    await settle()
  })
})
