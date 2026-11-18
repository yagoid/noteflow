import { describe, it, expect } from 'vitest'
import { getNoteSearchIndex, noteMatchesQuery, parseSearchQuery, sectionSearchMatch } from '../../src/lib/searchUtils'
import { extractTags } from '../../src/lib/noteUtils'
import { collectAlarms } from '../../src/lib/alarmUtils'
import {
  PREVIEW_DRAWING_CHARS, clipPreviewMarkdown, markdownTextStats, rawPreviewText, sectionCardStats, sectionPreviewHtml,
} from '../../src/lib/noteOverviewGrid'
import { parseDrawingMarkdown } from '../../src/lib/drawing/drawingBlock'
import type { Note } from '../../src/types'

// A drawing block seen by everything that reads a section as text: search, tags, word
// and task counts, alarms, clipped previews. A scene is JSON full of ids, seeds and hex
// colours — none of that may be searched, tagged or counted; what counts is what it says.

const F = '```'
const HEADER = '{"type":"excalidraw","version":2,"appState":{"viewBackgroundColor":"transparent"}}'
const el = (id: string, extra: string) => `{"id":"${id}","type":"rectangle","x":10,"y":20,"width":120,"height":60,"seed":987654,"strokeColor":"#e03131","backgroundColor":"#ffc9c9",${extra}}`
const text = (id: string, container: string | null, label: string) =>
  `{"id":"${id}","type":"text","x":20,"y":30,"width":40,"height":20,"containerId":${container ? `"${container}"` : 'null'},"strokeColor":"#abcdef","text":${JSON.stringify(label)}}`
const SCENE = ['<!-- drawing -->', `${F}excalidraw`, HEADER,
  el('boxAlpha', '"boundElements":[]'), text('t1', 'boxAlpha', 'Quarterly roadmap'),
  text('t2', null, 'Ship the beta'), text('t3', null, '- [ ] call Ana 📅2026-11-19 ⏰10:00'),
  F, '<!-- /drawing -->'].join('\n')
const MERMAID = ['<!-- drawing -->', `${F}mermaid`, 'flowchart TD', '  A[Kickoff] --> B[Launch]', '  style A fill:#f9f', F, '<!-- /drawing -->'].join('\n')
const note = (content: string): Note => ({
  id: 'n1', title: 'Plan', tags: [], created: '', updated: '', filePath: '',
  sections: [{ id: 's1', name: 'Main', content, created: '' }],
} as unknown as Note)

describe('global search', () => {
  const n = note(`Intro words\n\n${SCENE}\n\n${MERMAID}`)
  const matches = (q: string) => noteMatchesQuery(n, parseSearchQuery(q))

  it('finds what a drawing says: labels of a scene, the text of a Mermaid source', () => {
    for (const q of ['roadmap', 'QUARTERLY', 'ship the beta', 'Kickoff', 'launch', 'intro']) expect(matches(q), q).toBe(true)
    expect(sectionSearchMatch(n, parseSearchQuery('roadmap'))?.matched).toEqual([0])
  })

  it('does not find the JSON of the scene', () => {
    for (const q of ['seed', '987654', 'rectangle', 'boxAlpha', 'strokeColor', 'e03131', 'excalidraw', 'viewBackgroundColor', 'containerId']) {
      expect(matches(q), q).toBe(false)
    }
    expect(getNoteSearchIndex(n).sectionContents[0]).not.toContain('"id"')
  })

  it('a note without drawings is indexed as before', () => {
    const plain = note('Some text with "seed" and #tag')
    expect(getNoteSearchIndex(plain).sectionContents[0]).toBe('some text with "seed" and #tag')
  })
})

describe('tags', () => {
  it('nothing inside a drawing is a tag: hex colours, ids, labels, Mermaid styles', () => {
    expect(extractTags(`#real\n\n${SCENE}\n\n${MERMAID}\n\nand #other`)).toEqual(['real', 'other'])
    expect(extractTags(SCENE)).toEqual([])
    expect(extractTags(MERMAID)).toEqual([])
  })

  it('an invalid block is ordinary text, as always', () => {
    const broken = SCENE.replace('"type":"excalidraw"', '"type":"other"')
    expect(extractTags(broken)).toContain('e03131')
  })
})

describe('word and task counts', () => {
  it('a scene counts the words of its labels, and none of its text is a task', () => {
    // Quarterly roadmap · Ship the beta · call Ana (the 📅/⏰ annotations are not words)
    expect(markdownTextStats(SCENE)).toEqual({ words: 7, done: 0, total: 0 })
    expect(markdownTextStats(`- [ ] real task\n- [x] done\n\n${SCENE}`)).toMatchObject({ done: 1, total: 2 })
  })

  it('a Mermaid source counts as the code block it is', () => {
    const stats = markdownTextStats(MERMAID)
    expect(stats.total).toBe(0)
    expect(stats.words).toBeGreaterThan(3)
    expect(stats.words).toBeLessThan(15)
  })

  it('the card footer of a section that is only a drawing is a small word count', () => {
    expect(sectionCardStats(SCENE)).toEqual({ kind: 'words', count: 7 })
  })
})

describe('alarms', () => {
  it('a label that looks like a task with an alarm schedules nothing', () => {
    expect(collectAlarms([note(SCENE)])).toEqual([])
    expect(collectAlarms([note(`${MERMAID}\n\n${SCENE}`)])).toEqual([])
  })
})

describe('clipped previews', () => {
  const filler = (n: number) => Array.from({ length: n }, (_, i) => `Paragraph number ${i} with a few words in it.`).join('\n\n')
  const bigScene = ['<!-- drawing -->', `${F}excalidraw`, HEADER,
    ...Array.from({ length: 60 }, (_, i) => el(`e${i}`, '"boundElements":[]')), text('big', null, 'Big picture'), F, '<!-- /drawing -->'].join('\n')

  it('a long scene counts a fixed budget and is kept whole', () => {
    expect(bigScene.length).toBeGreaterThan(6000)
    const md = `Intro\n\n${bigScene}\n\nOutro`
    const clipped = clipPreviewMarkdown(md, 4000)
    expect(clipped).toBe(md)
    expect(parseDrawingMarkdown(clipped.split('\n\n')[1])).not.toBeNull()
    const html = sectionPreviewHtml(md, 4000)
    expect(html).toContain('data-type="drawing"')
    expect(html).toContain('Big picture')
    expect(html).toContain('Outro')
    expect(html).not.toContain('language-excalidraw')
  })

  it('the cut never falls inside a drawing: it is whole or left out', () => {
    for (let before = 3000; before <= 4200; before += 150) {
      const md = `${filler(Math.ceil(before / 45))}\n\n${bigScene}\n\n${filler(40)}`
      const clipped = clipPreviewMarkdown(md, 4000)
      const html = sectionPreviewHtml(md, 4000)
      expect(html, String(before)).not.toContain('language-excalidraw')
      expect(html, String(before)).not.toContain('&lt;!-- drawing')
      const opens = (clipped.match(/<!-- drawing -->/g) ?? []).length
      const closes = (clipped.match(/<!-- \/drawing -->/g) ?? []).length
      expect(opens, String(before)).toBe(closes)
      expect(clipped.length).toBeLessThanOrEqual(4000 + bigScene.length)
    }
    expect(PREVIEW_DRAWING_CHARS).toBeLessThan(1000)
  })

  it('text mode previews show the block as it is on disk', () => {
    expect(rawPreviewText(SCENE)).toBe(SCENE)
  })

  it('a section without drawings is clipped exactly as before', () => {
    const md = filler(200)
    expect(clipPreviewMarkdown(md, 4000).length).toBeLessThanOrEqual(4000)
    expect(clipPreviewMarkdown('short')).toBe('short')
  })
})
