import { describe, it, expect } from 'vitest'
import { externalUrlToOpen, isSameDocument, navigationAllowed } from '../../electron/navigationGuard'

const PACKAGED = 'file:///C:/Program%20Files/NoteFlow/resources/app.asar/dist/index.html'
const DEV = 'http://localhost:5173/'

describe('navigationAllowed (will-navigate)', () => {
  it('lets a window reload or change its hash route', () => {
    expect(navigationAllowed(PACKAGED, PACKAGED)).toBe(true)
    expect(navigationAllowed(`${PACKAGED}#sticky?noteId=a`, PACKAGED)).toBe(true)
    expect(navigationAllowed(PACKAGED, `${PACKAGED}#section-window?noteId=a&sectionId=b`)).toBe(true)
    expect(navigationAllowed(DEV, `${DEV}#ai-chat`)).toBe(true)
    expect(navigationAllowed(DEV, `${DEV}?t=1`)).toBe(true)
  })

  it('cancels anything that leaves the document', () => {
    for (const target of [
      'https://libraries.excalidraw.com/',
      'https://example.com/index.html',
      'http://localhost:5173/other',
      'http://localhost:9999/',
      'file:///C:/Windows/win.ini',
      'file:///C:/Program%20Files/NoteFlow/resources/app.asar/dist/other.html',
      'javascript:alert(1)',
      'data:text/html,<h1>x</h1>',
      'not a url',
      '',
    ]) {
      expect(navigationAllowed(PACKAGED, target), target).toBe(false)
      expect(navigationAllowed(DEV, target), target).toBe(false)
    }
    expect(isSameDocument('', '')).toBe(false)
  })
})

describe('externalUrlToOpen (setWindowOpenHandler)', () => {
  it('hands https to the system browser and nothing else', () => {
    expect(externalUrlToOpen('https://docs.excalidraw.com/x?y=1#z')).toBe('https://docs.excalidraw.com/x?y=1#z')
    for (const url of ['http://example.com/', 'file:///C:/x.html', 'javascript:alert(1)', 'data:text/html,x', 'about:blank', 'vscode://x', '', 'nope']) {
      expect(externalUrlToOpen(url), url).toBeNull()
    }
  })
})
