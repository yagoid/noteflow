// Minimal DOMParser for the node-only vitest env (no jsdom/happy-dom deps).
//
// It only understands what htmlFromMarkdown emits — well-formed tags, double-
// quoted attributes, void <br>/<hr>/<img>/<input>, a handful of entities — and
// implements just the DOM surface htmlToMarkdown and kanban.ts read. It is NOT
// a general HTML parser (no implicit tag closing, no foster parenting…): use it
// to round-trip our own output, not arbitrary HTML.

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input'])

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|nbsp|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    if (k === 'nbsp') return ' '
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10))
    return m
  })
}

// A class (not a plain object): matchers like toContain do `x instanceof Node`.
class MiniNode {
  static readonly ELEMENT_NODE = ELEMENT_NODE
  static readonly TEXT_NODE = TEXT_NODE
}

class MiniText extends MiniNode {
  readonly nodeType = TEXT_NODE
  constructor(public textContent: string) { super() }
}

class MiniElement extends MiniNode {
  readonly nodeType = ELEMENT_NODE
  readonly childNodes: (MiniElement | MiniText)[] = []
  readonly tagName: string
  constructor(tag: string, private attrs: Map<string, string>) {
    super()
    this.tagName = tag.toUpperCase()
  }
  get children(): MiniElement[] {
    return this.childNodes.filter((c): c is MiniElement => c instanceof MiniElement)
  }
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('')
  }
  get className(): string {
    return this.attrs.get('class') ?? ''
  }
  get style(): { textAlign: string } {
    const m = (this.attrs.get('style') ?? '').match(/text-align:\s*(\w+)/)
    return { textAlign: m ? m[1] : '' }
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }
  // Tag-name selectors only (all htmlToMarkdown uses).
  querySelectorAll(tag: string): MiniElement[] {
    const out: MiniElement[] = []
    const walk = (el: MiniElement) => {
      for (const c of el.children) {
        if (c.tagName.toLowerCase() === tag) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }
  querySelector(tag: string): MiniElement | null {
    return this.querySelectorAll(tag)[0] ?? null
  }
}

function parseHtml(html: string): MiniElement {
  const body = new MiniElement('body', new Map())
  const stack: MiniElement[] = [body]
  const re = /<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[a-z0-9-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const top = stack[stack.length - 1]
    if (m[1]) {
      const tag = m[1].toLowerCase()
      if (tag === 'body') continue
      if (top.tagName.toLowerCase() !== tag) throw new Error(`miniDom: unexpected </${tag}> in <${top.tagName}>`)
      stack.pop()
    } else if (m[2]) {
      const tag = m[2].toLowerCase()
      if (tag === 'body') continue
      const attrs = new Map<string, string>()
      for (const a of m[3].matchAll(/([a-z0-9-]+)(?:="([^"]*)")?/gi)) {
        attrs.set(a[1].toLowerCase(), decodeEntities(a[2] ?? ''))
      }
      const el = new MiniElement(tag, attrs)
      top.childNodes.push(el)
      if (!VOID_TAGS.has(tag)) stack.push(el)
    } else if (m[4]) {
      top.childNodes.push(new MiniText(decodeEntities(m[4])))
    }
  }
  if (stack.length !== 1) throw new Error(`miniDom: unclosed <${stack[stack.length - 1].tagName}>`)
  return body
}

/** Install DOMParser + Node on globalThis; returns an uninstall function. */
export function installMiniDom(): () => void {
  const g = globalThis as Record<string, unknown>
  const prev = { DOMParser: g.DOMParser, Node: g.Node }
  g.Node = MiniNode
  g.DOMParser = class {
    parseFromString(html: string) {
      return { body: parseHtml(html) }
    }
  }
  return () => {
    g.DOMParser = prev.DOMParser
    g.Node = prev.Node
  }
}

/** Parse an HTML fragment and return its first element (for element-level helpers). */
export function miniElement(html: string): Element {
  return parseHtml(html).children[0] as unknown as Element
}
