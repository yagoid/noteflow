import { describe, it, expect } from 'vitest'
import { rendererJsFlags, HEAP_GROWING_PERCENT } from '../../electron/v8Flags'

// Value of the `js-flags` switch main.ts appends for the renderer processes.
describe('rendererJsFlags', () => {
  it('returns only our flag when there are no previous flags', () => {
    expect(HEAP_GROWING_PERCENT).toBe(30)
    expect(rendererJsFlags('')).toBe('--heap-growing-percent=30')
    expect(rendererJsFlags('   ')).toBe('--heap-growing-percent=30')
  })

  it('keeps the previous flags in order and appends ours', () => {
    expect(rendererJsFlags('--expose-gc')).toBe('--expose-gc --heap-growing-percent=30')
    expect(rendererJsFlags('--expose-gc --max-old-space-size=512')).toBe(
      '--expose-gc --max-old-space-size=512 --heap-growing-percent=30',
    )
  })

  it('respects a heap growing percent that is already there (dashes)', () => {
    expect(rendererJsFlags('--heap-growing-percent=50')).toBe('--heap-growing-percent=50')
    expect(rendererJsFlags('--expose-gc --heap-growing-percent=10 --trace-gc')).toBe(
      '--expose-gc --heap-growing-percent=10 --trace-gc',
    )
  })

  it('respects a heap growing percent that is already there (underscores)', () => {
    expect(rendererJsFlags('--heap_growing_percent=50')).toBe('--heap_growing_percent=50')
    expect(rendererJsFlags('--expose-gc --heap_growing_percent=10')).toBe(
      '--expose-gc --heap_growing_percent=10',
    )
  })

  it('respects it without "=" (the value is the next token)', () => {
    expect(rendererJsFlags('--heap-growing-percent 50')).toBe('--heap-growing-percent 50')
    expect(rendererJsFlags('--expose-gc --heap_growing_percent 50 --trace-gc')).toBe(
      '--expose-gc --heap_growing_percent 50 --trace-gc',
    )
  })

  it('respects it with a single leading dash', () => {
    expect(rendererJsFlags('-heap-growing-percent=50')).toBe('-heap-growing-percent=50')
    expect(rendererJsFlags('--expose-gc -heap_growing_percent=50')).toBe(
      '--expose-gc -heap_growing_percent=50',
    )
  })

  it('adds ours next to flags that merely share the prefix', () => {
    expect(rendererJsFlags('--heap-growing-percentage=50')).toBe(
      '--heap-growing-percentage=50 --heap-growing-percent=30',
    )
  })

  // Chromium splits the js-flags value on commas before V8 sees it, and the last value wins.
  it('respects it anywhere in a comma-separated list', () => {
    expect(rendererJsFlags('--trace-gc,--heap-growing-percent=60')).toBe('--trace-gc --heap-growing-percent=60')
    expect(rendererJsFlags('--heap-growing-percent=60,--trace-gc')).toBe('--heap-growing-percent=60 --trace-gc')
    expect(rendererJsFlags('--expose-gc,--heap_growing_percent=60,--trace-gc')).toBe(
      '--expose-gc --heap_growing_percent=60 --trace-gc',
    )
    expect(rendererJsFlags('--expose-gc, --heap-growing-percent=60 --trace-gc')).toBe(
      '--expose-gc --heap-growing-percent=60 --trace-gc',
    )
  })

  it('keeps the flags of a comma-separated list and appends ours, space-separated', () => {
    expect(rendererJsFlags('--expose-gc,--trace-gc')).toBe('--expose-gc --trace-gc --heap-growing-percent=30')
    expect(rendererJsFlags(',--expose-gc,,--trace-gc, ')).toBe(
      '--expose-gc --trace-gc --heap-growing-percent=30',
    )
    expect(rendererJsFlags(' , ')).toBe('--heap-growing-percent=30')
  })

  it('is idempotent', () => {
    const inputs = [
      '',
      '--expose-gc',
      '  --expose-gc   --trace-gc ',
      '--heap_growing_percent=50',
      '--heap-growing-percent 50',
      '--expose-gc,--trace-gc',
      '--trace-gc,--heap-growing-percent=60',
    ]
    for (const existing of inputs) {
      const once = rendererJsFlags(existing)
      expect(rendererJsFlags(once)).toBe(once)
    }
  })

  it('normalises stray whitespace to single spaces', () => {
    expect(rendererJsFlags('  --expose-gc \t  --trace-gc  ')).toBe(
      '--expose-gc --trace-gc --heap-growing-percent=30',
    )
    expect(rendererJsFlags('  --heap-growing-percent=50  ')).toBe('--heap-growing-percent=50')
  })
})
