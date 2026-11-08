// Pure helpers of the sticky window's section switcher (title-bar dropdown, StickyApp.tsx).

/**
 * Whether the sticky shows the section name next to the note title. A lone default-named
 * section ('New' / 'Main') adds nothing, so it's hidden; with 2+ sections the name is
 * the switcher's trigger and is always shown.
 */
export function showStickySectionName(sectionName: string, sectionCount: number): boolean {
  if (sectionCount >= 2) return true
  return sectionName !== 'New' && sectionName !== 'Main'
}

/**
 * Index the focus moves to in a vertical menu of `count` items for a navigation key
 * (ArrowDown/ArrowUp wrap around, Home/End jump to the ends), or null when the key
 * isn't a navigation key (or the menu is empty). `current` -1 = nothing focused yet.
 */
export function menuNavIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown': return current < 0 ? 0 : (current + 1) % count
    case 'ArrowUp': return current < 0 ? count - 1 : (current - 1 + count) % count
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}

/**
 * The sticky's hash (`#sticky?noteId=…&sectionId=…`) pointing at another section, keeping
 * its other params, so a reload reopens the section shown now.
 */
export function stickyHashWithSection(hash: string, sectionId: string): string {
  const q = hash.indexOf('?')
  const route = q === -1 ? hash : hash.slice(0, q)
  const params = new URLSearchParams(q === -1 ? '' : hash.slice(q + 1))
  params.set('sectionId', sectionId)
  return `${route || '#sticky'}?${params.toString()}`
}
