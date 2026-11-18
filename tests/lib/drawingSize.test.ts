import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DRAWING_MAX_WIDTH, DRAWING_MIN_WIDTH,
  drawingWidthFromDrag, storedDrawingHeight, storedDrawingWidth, withDrawingSize,
} from '../../src/lib/drawing/drawingSize'
import { parseDrawingMarkdown, serializeDrawingMarkdown } from '../../src/lib/drawing/drawingBlock'
import { htmlFromMarkdown, htmlToMarkdown } from '../../src/lib/markdownHtml'
import { installMiniDom } from '../helpers/miniDom'

let uninstallDom: () => void
beforeAll(() => { uninstallDom = installMiniDom() })
afterAll(() => uninstallDom())

const F = '```'
const block = (attrs: string) => [`<!-- drawing${attrs ? ` ${attrs}` : ''} -->`, `${F}mermaid`, 'flowchart TD', '  A --> B', F, '<!-- /drawing -->'].join('\n')

describe('stored size (marker attributes)', () => {
  it('reads width and height in px, independently', () => {
    expect(storedDrawingWidth('width="900" height="320"')).toBe(900)
    expect(storedDrawingHeight('width="900" height="320"')).toBe(320)
    expect(storedDrawingWidth('height="320"')).toBeNull()
    expect(storedDrawingHeight('')).toBeNull()
    expect(storedDrawingWidth('width="640.4"')).toBe(640)
  })

  it('ignores what is not a size and clamps what is out of range', () => {
    for (const bad of ['width="wide"', 'width=""', 'width="-200"', 'width="12e3"', `width="${DRAWING_MIN_WIDTH - 1}"`, 'width="0"']) {
      expect(storedDrawingWidth(bad), bad).toBeNull()
    }
    expect(storedDrawingWidth('width="999999"')).toBe(DRAWING_MAX_WIDTH)
    expect(storedDrawingHeight('height="50"')).toBeNull()
    expect(storedDrawingHeight('height="99999"')).toBe(1600)
  })

  it('sets and removes a size leaving every other attribute as it was', () => {
    expect(withDrawingSize('', 'width', 800)).toBe('width="800"')
    expect(withDrawingSize('height="300" foo=bar', 'width', 800.6)).toBe('height="300" foo=bar width="801"')
    expect(withDrawingSize('width="800" height="300"', 'width', 640)).toBe('width="640" height="300"')
    expect(withDrawingSize('width="800" height="300" x="1"', 'width', null)).toBe('height="300" x="1"')
    expect(withDrawingSize('height="300"', 'width', null)).toBe('height="300"')
  })

  it('reads a size written by hand (unquoted, another case) and never leaves two of them', () => {
    for (const typed of ['width=900', 'WIDTH="900"', "Width='900'", 'width = 900']) {
      expect(storedDrawingWidth(typed), typed).toBe(900)
      expect(withDrawingSize(typed, 'width', 640), typed).toBe('width="640"')
      expect(withDrawingSize(typed, 'width', null), typed).toBe('')
    }
    expect(withDrawingSize('height="300" width=900 foo=bar', 'width', 640)).toBe('height="300" foo=bar width="640"')
    expect(withDrawingSize('WIDTH=700 width="800" height=300', 'width', 640)).toBe('width="640" height=300')
    expect(withDrawingSize('width="800" Width=700', 'height', 320)).toBe('width="800" Width=700 height="320"')
    expect(storedDrawingHeight('HEIGHT=320')).toBe(320)
    // Another attribute that merely ends in the same letters is not it.
    expect(storedDrawingWidth('maxwidth=900')).toBeNull()
    expect(withDrawingSize('maxwidth=900', 'width', 640)).toBe('maxwidth=900 width="640"')
  })

  it('round-trips through the markdown of the note, next to height', () => {
    const md = block('height="300" width="900"')
    expect(parseDrawingMarkdown(md)!.attrs).toBe('height="300" width="900"')
    expect(serializeDrawingMarkdown(parseDrawingMarkdown(md)!)).toBe(md)
    const doc = `Text\n\n${md}\n\nMore`
    expect(htmlToMarkdown(htmlFromMarkdown(doc))).toBe(doc)
    // Without the attribute nothing changes: the block is as it always was.
    expect(htmlToMarkdown(htmlFromMarkdown(block('')))).toBe(block(''))
  })
})

describe('drawingWidthFromDrag', () => {
  // A 600 px column at x = 300…900, inside an editor whose content is 1100 px wide.
  const column = { left: 300, width: 600 }
  const max = 1100
  const full = { left: 300, right: 900 } // a card as wide as the column

  it('right handle past the column: the card is centred, so the width is twice the distance to the centre', () => {
    expect(drawingWidthFromDrag({ side: 'right', dx: 100, start: full, column, max })).toBe(800)
    expect(drawingWidthFromDrag({ side: 'right', dx: 37, start: full, column, max })).toBe(674)
  })

  it('left handle mirrors it', () => {
    expect(drawingWidthFromDrag({ side: 'left', dx: -100, start: full, column, max })).toBe(800)
    expect(drawingWidthFromDrag({ side: 'left', dx: -37, start: full, column, max })).toBe(674)
  })

  it('never wider than the editor allows', () => {
    expect(drawingWidthFromDrag({ side: 'right', dx: 5000, start: full, column, max })).toBe(1100)
    expect(drawingWidthFromDrag({ side: 'left', dx: -5000, start: full, column, max })).toBe(1100)
    expect(drawingWidthFromDrag({ side: 'right', dx: 5000, start: full, column, max: 99999 })).toBe(DRAWING_MAX_WIDTH)
  })

  it('within the column the card is left-aligned: the right edge follows the cursor', () => {
    expect(drawingWidthFromDrag({ side: 'right', dx: -200, start: full, column, max })).toBe(400)
    expect(drawingWidthFromDrag({ side: 'right', dx: 50, start: { left: 300, right: 700 }, column, max })).toBe(450)
    expect(drawingWidthFromDrag({ side: 'left', dx: 150, start: full, column, max })).toBe(450)
  })

  it('never narrower than the minimum', () => {
    expect(drawingWidthFromDrag({ side: 'right', dx: -5000, start: full, column, max })).toBe(DRAWING_MIN_WIDTH)
    expect(drawingWidthFromDrag({ side: 'left', dx: 5000, start: full, column, max })).toBe(DRAWING_MIN_WIDTH)
  })

  it('coming back in from a breakout lands on the column, not beyond it', () => {
    const wide = { left: 100, right: 1100 } // 1000 px, centred on the 600 px column
    expect(drawingWidthFromDrag({ side: 'right', dx: -100, start: wide, column, max })).toBe(800)
    expect(drawingWidthFromDrag({ side: 'right', dx: -200, start: wide, column, max })).toBe(600)
    expect(drawingWidthFromDrag({ side: 'right', dx: -300, start: wide, column, max })).toBe(500)
  })

  it('in Full width (max = the column) it only shrinks', () => {
    expect(drawingWidthFromDrag({ side: 'right', dx: 300, start: full, column, max: 600 })).toBe(600)
    expect(drawingWidthFromDrag({ side: 'right', dx: -100, start: full, column, max: 600 })).toBe(500)
  })
})
