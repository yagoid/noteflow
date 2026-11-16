import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { tf } from '../../i18n/format'
import { useLanguageStore } from '../../stores/languageStore'
import {
  fitsTaskProgressRail,
  splitProgressTemplate,
  taskProgressBlocks,
  taskProgressFraction,
  taskProgressLabel,
  taskProgressPercent,
  taskProgressShouldPop,
  type TaskProgressBlock,
} from '../../lib/taskProgress'

// Progress rail of each checklist: a 3px line in the left margin of every
// top-level task list (lib/taskProgress.ts decides what counts and whether it
// fits; index.css § Checklist progress rail draws it). It's a widget decoration
// INSIDE the list's <ul> (its first child), so the <ul> anchors it: its height
// and scrolling come from CSS alone, nothing is measured per list. The widget's
// key is stable per block, so ProseMirror keeps its DOM across edits and the
// plugin view below updates it in place — that's what lets the fill animate.
// Only the main note editor installs it (Editor.tsx `taskProgress`); the CSS
// further shows it only in Readable width with the setting on (NoteEditor.tsx).
// Nothing reaches the document or the saved markdown.

/** Class of the widget (the rail block) inside each checklist's <ul>. */
export const TASK_PROGRESS_CLASS = 'task-progress'

interface PluginState {
  blocks: TaskProgressBlock[]
  decorations: DecorationSet
}

/** Per-editor state shared by the widgets' toDOM and the plugin view. */
interface Shared {
  /** Whether the left gutter holds the rail (last measurement). */
  fits: boolean
}

const taskProgressKey = new PluginKey<PluginState>('taskProgress')

/** Builds the empty rail block; `paint` fills it in. */
function createRail(): HTMLElement {
  const el = document.createElement('div')
  el.className = TASK_PROGRESS_CLASS
  el.contentEditable = 'false'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML =
    '<div class="task-progress-rail"><div class="task-progress-fill"></div><div class="task-progress-cap"></div></div>' +
    '<span class="task-progress-tag"></span>' +
    '<span class="task-progress-tip"></span>'
  // A press on it is neither a caret placement nor a drag start.
  el.addEventListener('mousedown', (e) => e.preventDefault())
  el.addEventListener('animationend', () => el.classList.remove('is-pop'))
  return el
}

/** Rewrites the tooltip («**3 of 8** tasks done · 38%») when its text changed. */
function paintTip(el: HTMLElement, done: number, total: number) {
  const t = useLanguageStore.getState().dict.editor.task
  const template = done >= total ? t.progressComplete : t.progressPartial
  const text = tf(template, { percent: taskProgressPercent(done, total) })
  const bold = tf(t.progressCount, { done, total })
  const signature = `${text}\u0000${bold}`
  if (el.dataset.tip === signature) return
  el.dataset.tip = signature
  const tip = el.querySelector<HTMLElement>(':scope > .task-progress-tip')
  if (!tip) return
  const [before, after] = splitProgressTemplate(text)
  const b = document.createElement('b')
  b.textContent = bold
  tip.replaceChildren(before, b, after)
}

/** Brings a rail block in line with its list's counts. `animate`: a later update (may bounce). */
function paint(el: HTMLElement, block: TaskProgressBlock, fits: boolean, animate: boolean) {
  const { done, total } = block
  const p = taskProgressFraction(done, total)
  const previous = el.dataset.p === undefined ? undefined : Number(el.dataset.p)
  el.style.setProperty('--h', `${p * 100}%`)
  el.classList.toggle('is-done', p >= 1)
  el.classList.toggle('is-fit', fits)
  const tag = el.querySelector<HTMLElement>(':scope > .task-progress-tag')
  const label = taskProgressLabel(done, total)
  if (tag && tag.textContent !== label) tag.textContent = label
  paintTip(el, done, total)
  if (animate && taskProgressShouldPop(previous, p)) {
    // Restart the bounce (removing and re-adding the class in one frame wouldn't).
    el.classList.remove('is-pop')
    void el.offsetWidth
    el.classList.add('is-pop')
  }
  el.dataset.p = String(p)
}

function buildState(doc: PMNode, shared: Shared): PluginState {
  const blocks = taskProgressBlocks(doc)
  const decorations = DecorationSet.create(
    doc,
    blocks.map((block) =>
      Decoration.widget(
        block.pos + 1,
        () => {
          const el = createRail()
          paint(el, block, shared.fits, false)
          return el
        },
        {
          side: -1,
          // Same key → ProseMirror reuses the DOM; the plugin view updates it.
          key: `task-progress-${block.index}`,
          ignoreSelection: true,
          stopEvent: () => true,
        },
      ),
    ),
  )
  return { blocks, decorations }
}

/**
 * Keeps the rails in step with the document and the language, and measures
 * whether the left gutter holds them: one measurement per editor (every
 * top-level list shares the column), batched in a frame and triggered by a
 * ResizeObserver on the editor (window, sidebar, TOC padding) and on each
 * checklist <ul> (Readable/Full and font size change their width).
 */
class TaskProgressView {
  private readonly observer: ResizeObserver
  private readonly observed = new Set<Element>()
  private frame: number | null = null
  private readonly unsubscribeLanguage: () => void
  private readonly view: EditorView
  private readonly shared: Shared

  constructor(view: EditorView, shared: Shared) {
    this.view = view
    this.shared = shared
    this.observer = new ResizeObserver(() => this.scheduleMeasure())
    this.observer.observe(view.dom)
    this.sync()
    this.unsubscribeLanguage = useLanguageStore.subscribe((state, prev) => {
      if (state.dict !== prev.dict) this.sync()
    })
  }

  update(view: EditorView, prevState: EditorState) {
    if (view.state.doc !== prevState.doc) this.sync()
  }

  destroy() {
    this.observer.disconnect()
    this.observed.clear()
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.unsubscribeLanguage()
  }

  /** The <ul> of a block and its rail block, when rendered. */
  private dom(block: TaskProgressBlock): { list: HTMLElement; rail: HTMLElement | null } | null {
    const list = this.view.nodeDOM(block.pos)
    if (!(list instanceof HTMLElement)) return null
    return { list, rail: list.querySelector<HTMLElement>(`:scope > .${TASK_PROGRESS_CLASS}`) }
  }

  private blocks(): TaskProgressBlock[] {
    return taskProgressKey.getState(this.view.state)?.blocks ?? []
  }

  /** Repaints every rail and observes the current set of checklist <ul>s. */
  private sync() {
    const lists = new Set<Element>()
    for (const block of this.blocks()) {
      const found = this.dom(block)
      if (!found) continue
      lists.add(found.list)
      if (found.rail) paint(found.rail, block, this.shared.fits, true)
    }
    for (const el of this.observed) {
      if (!lists.has(el)) {
        this.observer.unobserve(el)
        this.observed.delete(el)
      }
    }
    // observe() reports the element's size right away: a new list is measured.
    for (const el of lists) {
      if (!this.observed.has(el)) {
        this.observer.observe(el)
        this.observed.add(el)
      }
    }
  }

  private scheduleMeasure() {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.measure()
    })
  }

  /** Gutter = the first checklist's left edge − the editor's content-box left edge. */
  private measure() {
    const blocks = this.blocks()
    const first = blocks.length > 0 ? this.dom(blocks[0]) : null
    if (!first) return
    const dom = this.view.dom
    const style = getComputedStyle(dom)
    const contentLeft =
      dom.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    const fits = fitsTaskProgressRail(first.list.getBoundingClientRect().left - contentLeft)
    if (fits === this.shared.fits) return
    this.shared.fits = fits
    for (const block of blocks) this.dom(block)?.rail?.classList.toggle('is-fit', fits)
  }
}

/**
 * Checklist progress rails (see top). Installed only in the main note editor —
 * not in sticky windows, previews or the AI chat.
 */
export const TaskProgress = Extension.create({
  name: 'taskProgress',

  addProseMirrorPlugins() {
    const shared: Shared = { fits: false }
    return [
      new Plugin<PluginState>({
        key: taskProgressKey,
        state: {
          init: (_, state) => buildState(state.doc, shared),
          apply: (tr, value) => (tr.docChanged ? buildState(tr.doc, shared) : value),
        },
        props: {
          decorations: (state) => taskProgressKey.getState(state)?.decorations,
        },
        view: (view) => new TaskProgressView(view, shared),
      }),
    ]
  },
})
