// Remembered geometry of the sticky windows — where (and how big) the user last left
// each sticky, both expanded and folded into its pill.
//
// Pure helpers, no Electron imports (same pattern as whatsNewSeen.ts) so they can be
// unit-tested (tests/electron/stickyBounds.test.ts). main.ts persists the map in
// settings.json → `stickyBounds` (LOCAL to the PC, never synced: monitor layouts differ
// per machine) and survives restarts.
//
// Key = the (noteId, sectionId) the sticky window was OPENED with — the same pair the
// startup stickies use, so a startup sticky finds its geometry after a reboot. Switching
// sections in place (SectionSwitcher) does not change the key: main doesn't know which
// section a sticky shows, and the geometry belongs to the window, not to the section.

export interface StickyRect {
  x: number
  y: number
  width: number
  height: number
}

export interface StickyBoundsEntry {
  /** Last bounds of the expanded window. */
  expanded?: StickyRect
  /** Where the user left the folded pill (absent = stack it in the default corner). */
  folded?: StickyRect
}

export type StickyBoundsMap = Record<string, StickyBoundsEntry>

// LRU cap: entries of deleted notes are never cleaned up explicitly, so the map keeps
// only the most recently saved stickies (object key order = least → most recent).
export const MAX_STICKY_BOUNDS_ENTRIES = 200

const MAX_KEY_LENGTH = 300
const MAX_COORD = 100_000
const MAX_SIZE = 20_000

export function stickyBoundsKey(noteId: string, sectionId: string): string {
  return `${noteId}/${sectionId}`
}

/** A finite, integer, positive-size rect, or null for anything else. */
export function sanitizeRect(raw: unknown): StickyRect | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const nums = [r.x, r.y, r.width, r.height]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const [x, y, width, height] = (nums as number[]).map(Math.round)
  if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return null
  if (width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) return null
  return { x, y, width, height }
}

function sanitizeEntry(raw: unknown): StickyBoundsEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const entry: StickyBoundsEntry = {}
  const expanded = sanitizeRect(r.expanded)
  const folded = sanitizeRect(r.folded)
  if (expanded) entry.expanded = expanded
  if (folded) entry.folded = folded
  return expanded || folded ? entry : null
}

/** Cleans what settings.json holds (hand-editable, older builds): keeps valid entries, capped. */
export function sanitizeStickyBounds(raw: unknown): StickyBoundsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const valid: Array<[string, StickyBoundsEntry]> = []
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || key.length > MAX_KEY_LENGTH) continue
    const entry = sanitizeEntry(value)
    if (entry) valid.push([key, entry])
  }
  return Object.fromEntries(valid.slice(-MAX_STICKY_BOUNDS_ENTRIES))
}

/**
 * Merges `patch` into the entry of `key` and moves it to the most-recent end, evicting
 * the oldest entries beyond the cap. Returns a new map (the input is not mutated).
 */
export function withStickyBounds(
  map: StickyBoundsMap,
  key: string,
  patch: StickyBoundsEntry,
): StickyBoundsMap {
  if (!key || key.length > MAX_KEY_LENGTH) return map
  const merged: StickyBoundsEntry = { ...map[key] }
  const expanded = sanitizeRect(patch.expanded)
  const folded = sanitizeRect(patch.folded)
  if (expanded) merged.expanded = expanded
  if (folded) merged.folded = folded
  const rest = Object.entries(map).filter(([k]) => k !== key)
  rest.push([key, merged])
  return Object.fromEntries(rest.slice(-MAX_STICKY_BOUNDS_ENTRIES))
}

/**
 * Whether a remembered rect is still usable on the current monitor layout: at least half
 * of it inside ONE display, with its top edge (title bar / pill, the only drag handle)
 * on that display. A rect on a disconnected monitor (or after a resolution change that
 * leaves it mostly off-screen) is not — callers fall back to their default placement.
 * `displays` are the displays' full bounds: a sticky is always-on-top, so one left over
 * the taskbar is still visible.
 */
export function isRectVisible(rect: StickyRect, displays: StickyRect[]): boolean {
  const area = rect.width * rect.height
  if (area <= 0) return false
  return displays.some((d) => {
    const topOnDisplay = rect.y >= d.y && rect.y < d.y + d.height
    const ix = Math.min(rect.x + rect.width, d.x + d.width) - Math.max(rect.x, d.x)
    const iy = Math.min(rect.y + rect.height, d.y + d.height) - Math.max(rect.y, d.y)
    return topOnDisplay && ix > 0 && iy > 0 && ix * iy * 2 >= area
  })
}

/**
 * Trailing debounce per key (one timer per sticky window). `schedule` restarts the key's
 * timer; `flush` runs a pending call now (no-op if none); `cancel` drops it. main uses
 * it so a drag (macOS emits 'moved' = 'move' continuously) costs ONE settings.json
 * write instead of dozens — that file also holds tokens and keys, so fewer in-place
 * rewrites means fewer chances of a torn read by the CLI.
 */
export function createKeyedDebounce<K>(delayMs: number) {
  const timers = new Map<K, { timer: ReturnType<typeof setTimeout>; fn: () => void }>()
  const cancel = (key: K): void => {
    const pending = timers.get(key)
    if (pending) clearTimeout(pending.timer)
    timers.delete(key)
  }
  return {
    schedule(key: K, fn: () => void): void {
      cancel(key)
      const timer = setTimeout(() => {
        timers.delete(key)
        fn()
      }, delayMs)
      timers.set(key, { timer, fn })
    },
    flush(key: K): void {
      const pending = timers.get(key)
      if (!pending) return
      cancel(key)
      pending.fn()
    },
    cancel,
  }
}

/** True when `a` and `b` differ by more than `tolerance` px in position or size. */
export function rectChanged(a: StickyRect, b: StickyRect, tolerance = 2): boolean {
  return (
    Math.abs(a.x - b.x) > tolerance ||
    Math.abs(a.y - b.y) > tolerance ||
    Math.abs(a.width - b.width) > tolerance ||
    Math.abs(a.height - b.height) > tolerance
  )
}
