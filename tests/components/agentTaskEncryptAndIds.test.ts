// @vitest-environment happy-dom
// Two edges of the agent tasks in the app:
//   - the encryption modal warns (and asks for a tick) when the note has agent
//     reports — by its markers, or by the blocks of its agent.md alone;
//   - the id of a task handed over from the editor is made in the renderer,
//     against every id the window knows.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createElement, act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { EncryptionModal } from '../../src/components/EncryptionModal'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { newAgentTaskIdFor } from '../../src/components/Editor/useAgentTask'
import { htmlFromMarkdown } from '../../src/lib/markdownHtml'
import { resetAgentTasksStoreForTests, useAgentTasksStore } from '../../src/stores/agentTasksStore'
import { useNotesStore } from '../../src/stores/notesStore'
import type { AgentBlock, Note } from '../../src/types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ROBOT = '\u{1F916}'

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
})

describe('EncryptionModal — agent reports', () => {
  let blocks: AgentBlock[]
  let reads: string[]

  beforeEach(() => {
    blocks = []
    reads = []
    ;(window as unknown as { noteflow: unknown }).noteflow = {
      agentTasksRead: async (dir: string) => { reads.push(dir); return { blocks, discardable: [] } },
    }
  })

  async function mount(props: Partial<ComponentProps<typeof EncryptionModal>>) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(createElement(EncryptionModal, {
        mode: 'encrypt', noteTitle: 'Plan', onConfirm: vi.fn(async () => undefined), onCancel: vi.fn(), ...props,
      }))
    })
    const passwords = () => Array.from(host!.querySelectorAll<HTMLInputElement>('input[type="password"]'))
    const type = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      act(() => {
        setter.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const fillPasswords = () => passwords().forEach((input) => type(input, 'secret'))
    const submit = () => Array.from(host!.querySelectorAll('button')).filter((b) => b.textContent?.includes('Encrypt note')).pop()!
    const tick = () => host!.querySelector<HTMLInputElement>('input[type="checkbox"]')
    return { fillPasswords, submit, tick }
  }

  it('a note without markers and without reports encrypts as always', async () => {
    const m = await mount({ noteDir: 'C:\\notes\\plan-n1' })
    expect(reads).toEqual(['C:\\notes\\plan-n1'])
    expect(m.tick()).toBeNull()
    m.fillPasswords()
    expect(m.submit().disabled).toBe(false)
  })

  it('markers in the note: the warning shows at once and the box must be ticked', async () => {
    const m = await mount({ agentTasksWarning: true, noteDir: 'C:\\notes\\plan-n1' })
    expect(reads).toEqual([]) // already known: no need to ask main
    expect(host!.textContent).toContain('permanently deletes their reports')
    m.fillPasswords()
    expect(m.submit().disabled).toBe(true)
    act(() => m.tick()!.click())
    expect(m.submit().disabled).toBe(false)
  })

  it('reports on disk but no marker left in the note (orphaned blocks): same warning', async () => {
    blocks = [{ id: 'gone1', meta: { state: 'done' }, body: 'Report' }]
    const m = await mount({ agentTasksWarning: false, noteDir: 'C:\\notes\\plan-n1' })
    expect(host!.textContent).toContain('permanently deletes their reports')
    m.fillPasswords()
    expect(m.submit().disabled).toBe(true)
    act(() => m.tick()!.click())
    expect(m.submit().disabled).toBe(false)
  })

  it('nothing can be encrypted until main has answered', async () => {
    let answer: (v: { blocks: AgentBlock[]; discardable: string[] }) => void = () => undefined
    ;(window as unknown as { noteflow: unknown }).noteflow = {
      agentTasksRead: () => new Promise((resolve) => { answer = resolve }),
    }
    const m = await mount({ noteDir: 'C:\\notes\\plan-n1' })
    m.fillPasswords()
    expect(m.submit().disabled).toBe(true)
    await act(async () => { answer({ blocks: [], discardable: [] }) })
    expect(m.submit().disabled).toBe(false)
  })

  it('a failed read does not block the encryption; other modes never ask', async () => {
    ;(window as unknown as { noteflow: unknown }).noteflow = { agentTasksRead: async () => { throw new Error('boom') } }
    const m = await mount({ noteDir: 'C:\\notes\\plan-n1' })
    m.fillPasswords()
    expect(m.submit().disabled).toBe(false)
    act(() => root?.unmount())
    host?.remove()

    const asked = vi.fn()
    ;(window as unknown as { noteflow: unknown }).noteflow = { agentTasksRead: asked }
    await mount({ mode: 'remove', agentTasksWarning: true, noteDir: 'C:\\notes\\plan-n1' })
    expect(asked).not.toHaveBeenCalled()
    expect(host!.querySelector('input[type="checkbox"]')).toBeNull()
  })
})

describe('newAgentTaskIdFor', () => {
  const note = (id: string, content: string): Note => ({
    id, title: id, tags: [], created: '', updated: '', archived: false, favorited: false,
    sections: [{ id: 's', name: 'S', content }], raw: '', filePath: `C:\\notes\\${id}`,
  })

  /** crypto bytes that spell these ids in order ('a' = 0, 'b' = 1…), then 'z's. */
  function drawIds(...ids: string[]) {
    const bytes = ids.join('').split('').map((ch) => 'abcdefghijklmnopqrstuvwxyz0123456789'.indexOf(ch))
    let i = 0
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) array[0] = i < bytes.length ? bytes[i++] : 25
      return array
    })
  }

  let editor: Editor

  beforeEach(() => {
    resetAgentTasksStoreForTests()
    ;(window as unknown as { noteflow: unknown }).noteflow = new Proxy({}, {
      get: (_t, name: string) => () => { throw new Error(`unexpected window.noteflow.${name}()`) },
    })
    editor = new Editor({
      extensions: schemaExtensions(),
      content: htmlFromMarkdown([
        `- [ ] In the doc ${ROBOT}doc01:queued`,
        '',
        '<!-- kanban -->',
        '- Todo',
        `  - [ ] Card ${ROBOT}card1:queued`,
        '<!-- /kanban -->',
      ].join('\n')),
    })
    useNotesStore.setState({ notes: [note('n1', 'no tasks'), note('n2', `- [ ] Elsewhere ${ROBOT}note2:running`)] })
    useAgentTasksStore.setState({ byId: { blok1: { id: 'blok1', meta: {}, body: '' } } })
  })

  afterEach(() => {
    editor.destroy()
    useNotesStore.setState({ notes: [] })
    resetAgentTasksStoreForTests()
  })

  it('never asks main (no read of the notes dir per click) and returns a well-formed id', () => {
    const id = newAgentTaskIdFor(editor) // the bridge throws on any call
    expect(id).toMatch(/^[a-z0-9]{5}$/)
  })

  it('skips every id the window knows: the document, its kanban cards, the other notes and the loaded reports', () => {
    drawIds('doc01', 'card1', 'note2', 'blok1', 'fresh')
    expect(newAgentTaskIdFor(editor)).toBe('fresh')
  })

  it('takes the first free one', () => {
    drawIds('free1')
    expect(newAgentTaskIdFor(editor)).toBe('free1')
  })
})
