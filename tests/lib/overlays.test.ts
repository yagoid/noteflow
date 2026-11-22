// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { hasOpenOverlay } from '../../src/lib/overlays'

const mount = (html: string) => {
  document.body.innerHTML = html
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('hasOpenOverlay', () => {
  it('is false for the plain app', () => {
    mount('<main><div class="fixed inset-0 z-20"></div><div class="fixed top-0"></div></main>')
    expect(hasOpenOverlay()).toBe(false)
  })

  it('sees aria-modal dialogs, role="menu" dropdowns and marked context menus', () => {
    mount('<div role="dialog" aria-modal="true"></div>')
    expect(hasOpenOverlay()).toBe(true)
    mount('<div role="menu"></div>')
    expect(hasOpenOverlay()).toBe(true)
    mount('<div data-overlay class="fixed z-50"></div>')
    expect(hasOpenOverlay()).toBe(true)
  })

  it('sees the full-screen modals with a dark backdrop (Settings, palette…)', () => {
    mount('<div class="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm"><div></div></div>')
    expect(hasOpenOverlay()).toBe(true)
  })

  it('sees Settings and the palette open above the content view', () => {
    // What the content view's Escape snapshot reads (Settings / palette: backdrop + dialog).
    mount(
      '<main><section class="cv-root"></section></main>' +
      '<div class="fixed inset-0 z-50 flex bg-black/60"><div role="dialog" aria-modal="true"></div></div>',
    )
    expect(hasOpenOverlay()).toBe(true)
  })

  it('ignores an overlay inside `except` (the view’s own menu), not the others', () => {
    mount('<section id="view"><div role="menu"></div></section>')
    const view = document.getElementById('view')
    expect(hasOpenOverlay(document, view)).toBe(false)
    // The same menu with a modal above it still counts as an overlay.
    document.body.insertAdjacentHTML('beforeend', '<div class="fixed inset-0 bg-black/60"></div>')
    expect(hasOpenOverlay(document, view)).toBe(true)
    // A dialog elsewhere counts too.
    mount('<section id="view"><div role="menu"></div></section><div aria-modal="true"></div>')
    expect(hasOpenOverlay(document, document.getElementById('view'))).toBe(true)
  })

  it('`except` = null behaves like no exception', () => {
    mount('<div role="menu"></div>')
    expect(hasOpenOverlay(document, null)).toBe(true)
  })
})
