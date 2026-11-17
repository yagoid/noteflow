// @vitest-environment happy-dom
//
// Checklist progress rails (src/lib/taskProgress.ts) on the editor's REAL schema:
// which task lists get a rail and what they count, whether the left gutter holds
// it, and the small helpers the widget paints with.

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import {
  TASK_PROGRESS_MIN_GUTTER,
  fitsTaskProgressRail,
  splitProgressTemplate,
  taskProgressBlocks,
  taskProgressFraction,
  taskProgressLabel,
  taskProgressPercent,
  taskProgressShouldPop,
} from '../../src/lib/taskProgress'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import { TASK_PROGRESS_CLASS, TaskProgress } from '../../src/components/Editor/TaskProgress'
import { schemaExtensions } from '../../src/components/Editor/editorExtensions'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { load } from '../helpers/editorPipeline'

const counts = (md: string) => taskProgressBlocks(load(md)).map(({ index, done, total }) => ({ index, done, total }))

describe('taskProgressBlocks', () => {
  it('counts a top-level checklist, nested subtasks included', () => {
    expect(counts('- [ ] a\n- [x] b\n  - [x] b1\n  - [ ] b2\n- [x] c')).toEqual([{ index: 0, done: 3, total: 5 }])
  })

  it('points at the list node', () => {
    const doc = load('Intro\n\n- [ ] a\n- [x] b')
    const [block] = taskProgressBlocks(doc)
    expect(doc.nodeAt(block.pos)?.type.name).toBe('taskList')
  })

  it('needs at least two tasks', () => {
    expect(counts('- [x] alone')).toEqual([])
    expect(counts('- [ ] a\n  - [ ] a1')).toEqual([{ index: 0, done: 0, total: 2 }])
  })

  it('splits lists cut by a paragraph or a heading into separate blocks', () => {
    expect(counts('- [ ] a\n- [x] b\n\ntext\n\n- [x] c\n- [x] d\n\n## H\n\n- [ ] e\n- [ ] f')).toEqual([
      { index: 0, done: 1, total: 2 },
      { index: 1, done: 2, total: 2 },
      { index: 2, done: 0, total: 2 },
    ])
  })

  it('keeps the ordinal of every top-level list, short ones included (stable widget keys)', () => {
    expect(counts('- [ ] lonely\n\ntext\n\n- [ ] a\n- [ ] b')).toEqual([{ index: 1, done: 0, total: 2 }])
  })

  it('ignores task lists that are not direct children of the document', () => {
    expect(counts('> - [ ] a\n> - [x] b')).toEqual([])
    expect(counts('- plain\n  - [ ] a\n  - [x] b')).toEqual([])
    expect(counts('<!-- kanban -->\n- Todo\n  - [ ] a\n  - [x] b\n<!-- /kanban -->')).toEqual([])
  })
})

describe('fitsTaskProgressRail', () => {
  it('needs the offset + the rail block + a margin (78 px)', () => {
    expect(TASK_PROGRESS_MIN_GUTTER).toBe(78)
    expect(fitsTaskProgressRail(78)).toBe(true)
    expect(fitsTaskProgressRail(200)).toBe(true)
    expect(fitsTaskProgressRail(77.9)).toBe(false)
    expect(fitsTaskProgressRail(0)).toBe(false)
    expect(fitsTaskProgressRail(-12)).toBe(false)
  })
})

describe('labels and numbers', () => {
  it('shows done/total, or a check once complete', () => {
    expect(taskProgressLabel(3, 8)).toBe('3/8')
    expect(taskProgressLabel(0, 2)).toBe('0/2')
    expect(taskProgressLabel(8, 8)).toBe('✓')
  })

  it('computes the fraction and the rounded percent', () => {
    expect(taskProgressFraction(3, 8)).toBe(0.375)
    expect(taskProgressFraction(0, 0)).toBe(0)
    expect(taskProgressPercent(3, 8)).toBe(38)
    expect(taskProgressPercent(1, 3)).toBe(33)
    expect(taskProgressPercent(5, 5)).toBe(100)
  })

  it('bounces only when reaching 100 % from below', () => {
    expect(taskProgressShouldPop(0.5, 1)).toBe(true)
    expect(taskProgressShouldPop(undefined, 1)).toBe(false)
    expect(taskProgressShouldPop(1, 1)).toBe(false)
    expect(taskProgressShouldPop(0.5, 0.75)).toBe(false)
    expect(taskProgressShouldPop(1, 0.5)).toBe(false)
  })

  it('splits the tooltip templates around the bold part', () => {
    expect(splitProgressTemplate('{progress} tasks done · 38%')).toEqual(['', ' tasks done · 38%'])
    expect(splitProgressTemplate('Done: {progress}!')).toEqual(['Done: ', '!'])
    expect(splitProgressTemplate('no placeholder')).toEqual(['no placeholder', ''])
    for (const dict of [en, es]) {
      expect(dict.editor.task.progressPartial).toContain('{progress}')
      expect(dict.editor.task.progressComplete).toContain('{progress}')
    }
  })
})

describe('TaskProgress widget (editor plugin)', () => {
  const rails = (editor: Editor) =>
    Array.from(editor.view.dom.querySelectorAll<HTMLElement>(`ul[data-type="taskList"] > .${TASK_PROGRESS_CLASS}`))

  it('puts one rail as the first child of each top-level checklist, out of the markdown', () => {
    const md = '- [ ] a\n- [x] b\n\ntext\n\n- [x] lonely\n\n> - [ ] q1\n> - [ ] q2'
    const editor = new Editor({ extensions: [...schemaExtensions(), TaskProgress], content: htmlFromMarkdown(md) })
    const found = rails(editor)
    expect(found).toHaveLength(1)
    expect(found[0].parentElement?.firstElementChild).toBe(found[0])
    expect(found[0].style.getPropertyValue('--h')).toBe('50%')
    expect(found[0].querySelector('.task-progress-tag')?.textContent).toBe('1/2')
    expect(found[0].querySelector('.task-progress-tip b')?.textContent).toBe('1 of 2')
    expect(htmlToMarkdown(editor.getHTML())).toBe(md)
    editor.destroy()
  })

  it('updates the same rail in place when a task is checked', () => {
    const editor = new Editor({ extensions: [...schemaExtensions(), TaskProgress], content: htmlFromMarkdown('- [ ] a\n- [x] b') })
    const [rail] = rails(editor)
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (pos < 0 && node.type.name === 'taskItem' && !node.attrs.checked) pos = p
      return true
    })
    editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'checked', true))
    const [after] = rails(editor)
    expect(after).toBe(rail)
    expect(after.style.getPropertyValue('--h')).toBe('100%')
    expect(after.classList.contains('is-done')).toBe(true)
    expect(after.classList.contains('is-pop')).toBe(true)
    expect(after.querySelector('.task-progress-tag')?.textContent).toBe('✓')
    expect(after.querySelector('.task-progress-tip')?.textContent).toBe('2 of 2 · list complete')
    editor.destroy()
  })

  it('does not bounce a list mounted complete', () => {
    const editor = new Editor({ extensions: [...schemaExtensions(), TaskProgress], content: htmlFromMarkdown('- [x] a\n- [x] b') })
    const [rail] = rails(editor)
    expect(rail.classList.contains('is-done')).toBe(true)
    expect(rail.classList.contains('is-pop')).toBe(false)
    editor.destroy()
  })
})
