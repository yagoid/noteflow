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
})
