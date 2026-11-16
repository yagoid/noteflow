// ── Paste decisions for tables (clipboard formats → which path) ──────────────
//
// What the note editor's paste handler (components/Editor/tableClipboard.ts)
// asks of the clipboard before touching the document: is this HTML a
// ProseMirror copy, is this text a spreadsheet range, is this image just a
// picture of a copied table. Strings in, booleans out (HTML is read with the
// browser's DOMParser). Decisions are documented in .agents/context/patterns.md
// ("Editor: teclado y portapapeles de tablas").

import { looksLikeTabularText } from './tableData'

/** HTML that ProseMirror put on the clipboard (copied from a NoteFlow editor): its slice is pasted as-is. */
export function isProseMirrorHtml(html: string): boolean {
  return /\sdata-pm-slice=/.test(html)
}

// Clipboard HTML that is never content: styles and metadata (Excel's <style>,
// Sheets' <style> inside <google-sheets-html-origin>), column definitions.
const NON_CONTENT = 'head, style, script, meta, title, link, template, noscript, colgroup, col'

/**
 * Whether `html` is empty, or its only content with text is ONE table (what
 * Excel, Google Sheets, Numbers, LibreOffice or a table selected in a browser
 * put next to their tab-separated text). Text outside the table must be
 * whitespace; styles, meta tags, column definitions and wrappers without text
 * (`<google-sheets-html-origin>`) don't count.
 */
export function htmlIsOnlyTable(html: string): boolean {
  return !html.trim() || onlyTable(html) !== null
}

/** The one table that is `html`'s only content with text (htmlIsOnlyTable), or null. */
function onlyTable(html: string): Element | null {
  if (!/<table[\s>]/i.test(html)) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll(NON_CONTENT).forEach((el) => el.remove())
  const tables = Array.from(doc.querySelectorAll('table')).filter((t) => !t.parentElement?.closest('table'))
  if (tables.length !== 1) return null
  const table = tables[0]
  table.remove()
  return (doc.body?.textContent ?? '').trim() ? null : table
}

/** HTML a spreadsheet put on the clipboard: Google Sheets' wrapper, Excel's namespace / ProgId. */
export function isSpreadsheetHtml(html: string): boolean {
  return /<google-sheets-html-origin[\s>]|urn:schemas-microsoft-com:office:excel|ProgId\s+content=["']?Excel\./i.test(html)
}

// Inline markup that the text alone would lose: links, images and character formatting.
// A <b style="font-weight:normal"> is Google Docs' wrapper, not bold.
const INLINE_TAGS = 'a[href], img, b, strong, i, em, u, s, del, strike, code, mark'
const INLINE_STYLE_RES = [
  /font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i,
  /font-style\s*:\s*italic\b/i,
  /text-decoration[\w-]*\s*:[^;]*\b(underline|line-through)\b/i,
]

/**
 * Does `table` carry inline formatting its tab-separated text would drop?
 * Tags (links, images, bold / italic / underline / strike / code / highlight)
 * always count; inline styles (bold / italic / underline / strike, how Google
 * Docs writes them) only outside spreadsheets — Excel and Sheets style whole
 * cells (classes, the td's style), which isn't text formatting markdown keeps.
 */
function hasInlineFormatting(table: Element, spreadsheet: boolean): boolean {
  const tags = Array.from(table.querySelectorAll(INLINE_TAGS))
    .filter((el) => !(el.tagName === 'B' && /font-weight\s*:\s*normal/i.test(el.getAttribute('style') ?? '')))
  if (tags.length) return true
  if (spreadsheet) return false
  return Array.from(table.querySelectorAll('[style]'))
    .some((el) => INLINE_STYLE_RES.some((re) => re.test(el.getAttribute('style') ?? '')))
}

/**
 * Should a paste of `text` (+ `html`) become table cells read from the text?
 * Tab-separated text (looksLikeTabularText: strict, so prose, code, Word
 * lists, CSV and markdown pipe tables say no) whose HTML is empty, or is just
 * one table WITHOUT inline formatting (hasInlineFormatting). Browsers, Word and
 * Google Docs also put TSV next to a copied table: when that table has links,
 * bold, italics… its HTML is pasted instead (natively, then normalized), so
 * they survive. A spreadsheet range (Excel, Sheets) usually has none: it goes
 * by its text — unless a cell holds a link, an image or rich text.
 */
export function shouldPasteAsTsv(text: string, html: string): boolean {
  if (!looksLikeTabularText(text)) return false
  if (!html.trim()) return true
  const table = onlyTable(html)
  return table !== null && !hasInlineFormatting(table, isSpreadsheetHtml(html))
}

/**
 * Is an image on the clipboard only a picture of copied cells? Excel and
 * Numbers put a bitmap of the range next to its HTML table and tab-separated
 * text: the table is what gets pasted, not the picture.
 */
export function isTablePicture(text: string, html: string): boolean {
  return /<table[\s>]/i.test(html) || looksLikeTabularText(text)
}
