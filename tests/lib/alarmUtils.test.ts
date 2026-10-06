import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { collectAlarms } from '../../src/lib/alarmUtils'
import type { Note } from '../../src/types'

// collectAlarms reads only note.title and note.sections[].content, but typing
// the fixtures as Note keeps us honest about the public signature.
function noteWith(content: string, title = 'My Note'): Note {
  return {
    id: 'n1',
    title,
    tags: [],
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    archived: false,
    favorited: false,
    sections: [{ id: 's1', name: 'Tasks', content }],
    raw: '',
    filePath: '/notes/n1',
  }
}

// Anchor "now" to a fixed instant so the −24h / +7d window is deterministic.
// 2024-06-15T12:00:00 local time.
const NOW = new Date(2024, 5, 15, 12, 0, 0)

describe('collectAlarms', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('extracts a task with 📅 date + ⏰ time inside the window', () => {
    const note = noteWith('- [ ] Pay rent 📅2024-06-16 ⏰09:30')
    const alarms = collectAlarms([note])
    expect(alarms).toEqual([
      { noteTitle: 'My Note', taskText: 'Pay rent', alarmAt: '2024-06-16T09:30:00' },
    ])
  })

  it('ignores tasks with a date but no ⏰ time', () => {
    const note = noteWith('- [ ] No alarm 📅2024-06-16')
    expect(collectAlarms([note])).toEqual([])
  })

  it('drops alarms older than 24h in the past', () => {
    // 2024-06-13 is ~2 days before NOW → outside the −24h window
    const note = noteWith('- [ ] Old 📅2024-06-13 ⏰09:00')
    expect(collectAlarms([note])).toEqual([])
  })

  it('drops alarms further than 7 days in the future', () => {
    const note = noteWith('- [ ] Far 📅2024-06-30 ⏰09:00')
    expect(collectAlarms([note])).toEqual([])
  })

  it('keeps a missed alarm within the last 24h', () => {
    // NOW is 12:00 on 2024-06-15; an alarm earlier the same day is within 24h
    const note = noteWith('- [ ] Missed 📅2024-06-15 ⏰06:00')
    const alarms = collectAlarms([note])
    expect(alarms).toHaveLength(1)
    expect(alarms[0].alarmAt).toBe('2024-06-15T06:00:00')
  })

  it('collects from multiple notes and sections', () => {
    const a = noteWith('- [ ] A 📅2024-06-16 ⏰08:00', 'Note A')
    const b = noteWith('- [x] B done 📅2024-06-17 ⏰10:00', 'Note B')
    const alarms = collectAlarms([a, b])
    expect(alarms.map((x) => x.taskText)).toEqual(['A', 'B done'])
  })

  // Nested sub-tasks and kanban cards are indented task lines.
  it('extracts indented tasks (sub-tasks and kanban cards)', () => {
    const note = noteWith([
      '- [ ] Parent',
      '  - [ ] Sub 📅2024-06-16 ⏰08:00',
      '<!-- kanban -->',
      '- Todo',
      '  - [ ] Card 📅2024-06-16 ⏰09:00 🔺high',
      '      - [x] Deep \t📅2024-06-17 ⏰10:00',
      '<!-- /kanban -->',
      '\t- [ ] Tabbed 📅2024-06-18 ⏰11:00',
    ].join('\n'))
    expect(collectAlarms([note])).toEqual([
      { noteTitle: 'My Note', taskText: 'Sub', alarmAt: '2024-06-16T08:00:00' },
      { noteTitle: 'My Note', taskText: 'Card', alarmAt: '2024-06-16T09:00:00' },
      { noteTitle: 'My Note', taskText: 'Deep', alarmAt: '2024-06-17T10:00:00' },
      { noteTitle: 'My Note', taskText: 'Tabbed', alarmAt: '2024-06-18T11:00:00' },
    ])
  })

  it('still ignores non-task lines with annotations', () => {
    const note = noteWith('  - plain bullet 📅2024-06-16 ⏰08:00\n  text - [ ] x 📅2024-06-16 ⏰08:00')
    expect(collectAlarms([note])).toEqual([])
  })
})
