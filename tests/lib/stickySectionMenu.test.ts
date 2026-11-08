import { describe, it, expect } from 'vitest'
import { menuNavIndex, showStickySectionName, stickyHashWithSection } from '../../src/lib/stickySectionMenu'

describe('showStickySectionName', () => {
  it('hides a lone default-named section', () => {
    expect(showStickySectionName('New', 1)).toBe(false)
    expect(showStickySectionName('Main', 1)).toBe(false)
  })

  it('shows a lone custom-named section', () => {
    expect(showStickySectionName('Ideas', 1)).toBe(true)
  })

  it('always shows the name when there are sections to switch to', () => {
    expect(showStickySectionName('New', 2)).toBe(true)
    expect(showStickySectionName('Main', 5)).toBe(true)
    expect(showStickySectionName('Ideas', 3)).toBe(true)
  })
})

describe('menuNavIndex', () => {
  it('moves down and up, wrapping around', () => {
    expect(menuNavIndex('ArrowDown', 0, 3)).toBe(1)
    expect(menuNavIndex('ArrowDown', 2, 3)).toBe(0)
    expect(menuNavIndex('ArrowUp', 1, 3)).toBe(0)
    expect(menuNavIndex('ArrowUp', 0, 3)).toBe(2)
  })

  it('jumps to the ends with Home / End', () => {
    expect(menuNavIndex('Home', 2, 4)).toBe(0)
    expect(menuNavIndex('End', 0, 4)).toBe(3)
  })

  it('starts at the first / last item when nothing is focused', () => {
    expect(menuNavIndex('ArrowDown', -1, 3)).toBe(0)
    expect(menuNavIndex('ArrowUp', -1, 3)).toBe(2)
  })

  it('ignores other keys and empty menus', () => {
    expect(menuNavIndex('Enter', 0, 3)).toBeNull()
    expect(menuNavIndex('a', 0, 3)).toBeNull()
    expect(menuNavIndex('ArrowDown', -1, 0)).toBeNull()
  })
})

describe('stickyHashWithSection', () => {
  it('replaces the section and keeps the note', () => {
    expect(stickyHashWithSection('#sticky?noteId=n1&sectionId=s1', 's2')).toBe('#sticky?noteId=n1&sectionId=s2')
  })

  it('adds the section when the hash had none', () => {
    expect(stickyHashWithSection('#sticky?noteId=n1', 's2')).toBe('#sticky?noteId=n1&sectionId=s2')
    expect(stickyHashWithSection('#sticky', 's2')).toBe('#sticky?sectionId=s2')
  })

  it('encodes the id', () => {
    const hash = stickyHashWithSection('#sticky?noteId=n1&sectionId=s1', 'a&b c')
    expect(new URLSearchParams(hash.split('?')[1]).get('sectionId')).toBe('a&b c')
  })
})
