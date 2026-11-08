import { describe, it, expect } from 'vitest'
import { BookOpen, Code } from 'lucide-react'
import { FOLDER_ICONS, resolveFolderIcon } from '../../src/lib/folderIcons'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'

describe('resolveFolderIcon', () => {
  it('maps a known key to its lucide icon', () => {
    expect(resolveFolderIcon('book')).toBe(BookOpen)
    expect(resolveFolderIcon('code')).toBe(Code)
  })

  it('falls back to the default glyph (null) for an unknown key', () => {
    expect(resolveFolderIcon('not-an-icon')).toBeNull()
    // The lucide export name is not a key.
    expect(resolveFolderIcon('BookOpen')).toBeNull()
  })

  it('falls back to the default glyph (null) when unset', () => {
    expect(resolveFolderIcon(undefined)).toBeNull()
    expect(resolveFolderIcon(null)).toBeNull()
    expect(resolveFolderIcon('')).toBeNull()
  })
})

describe('FOLDER_ICONS', () => {
  it('has unique keys, each resolving to its own icon', () => {
    const keys = FOLDER_ICONS.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const { key, icon } of FOLDER_ICONS) expect(resolveFolderIcon(key)).toBe(icon)
  })

  it('has a label for every key in both languages', () => {
    for (const { key } of FOLDER_ICONS) {
      expect(en.common.folderIcons[key]).toBeTruthy()
      expect(es.common.folderIcons[key]).toBeTruthy()
    }
  })
})
