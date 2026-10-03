import { describe, it, expect } from 'vitest'
import { chatActivityCue, msUntilStalled, STREAM_IDLE_MS, type ChatActivityInput } from '../../src/lib/chatActivity'

// A turn whose text is actively flowing.
const flowing: ChatActivityInput = {
  streaming: true,
  lastRole: 'assistant',
  awaitingModelText: false,
  toolRunning: false,
  pendingConfirm: false,
  lastDeltaAt: 1_000,
  stalled: false,
}

describe('chatActivityCue', () => {
  it('shows nothing once the turn is no longer streaming', () => {
    expect(chatActivityCue({ ...flowing, streaming: false })).toBe('none')
    expect(chatActivityCue({ ...flowing, streaming: false, awaitingModelText: true })).toBe('none')
    expect(chatActivityCue({ ...flowing, streaming: false, stalled: true })).toBe('none')
  })

  it('shows nothing when the last message is not the assistant turn', () => {
    expect(chatActivityCue({ ...flowing, lastRole: 'user' })).toBe('none')
    expect(chatActivityCue({ ...flowing, lastRole: undefined })).toBe('none')
  })

  it('thinks while awaiting the first text of a step', () => {
    expect(chatActivityCue({ ...flowing, awaitingModelText: true, lastDeltaAt: null })).toBe('thinking')
    // after a tool result the flag is re-armed even though earlier text exists
    expect(chatActivityCue({ ...flowing, awaitingModelText: true })).toBe('thinking')
  })

  it('shows the streaming cue while text is flowing', () => {
    expect(chatActivityCue(flowing)).toBe('streaming')
  })

  it('falls back to thinking when the stream stalls (e.g. tool-call arguments being generated)', () => {
    expect(chatActivityCue({ ...flowing, stalled: true })).toBe('thinking')
  })

  it('falls back to thinking if streaming with no text and no awaiting flag', () => {
    expect(chatActivityCue({ ...flowing, lastDeltaAt: null })).toBe('thinking')
  })

  it('defers to the tool activity row while a tool runs', () => {
    expect(chatActivityCue({ ...flowing, toolRunning: true })).toBe('none')
    expect(chatActivityCue({ ...flowing, toolRunning: true, awaitingModelText: true })).toBe('none')
    expect(chatActivityCue({ ...flowing, toolRunning: true, stalled: true })).toBe('none')
  })

  it('defers to the confirmation card while one is pending', () => {
    expect(chatActivityCue({ ...flowing, pendingConfirm: true })).toBe('none')
    expect(chatActivityCue({ ...flowing, pendingConfirm: true, awaitingModelText: true })).toBe('none')
    expect(chatActivityCue({ ...flowing, pendingConfirm: true, stalled: true })).toBe('none')
  })
})

describe('msUntilStalled', () => {
  it('counts down from the last delta', () => {
    expect(msUntilStalled(1_000, 1_000)).toBe(STREAM_IDLE_MS)
    expect(msUntilStalled(1_000, 1_500)).toBe(STREAM_IDLE_MS - 500)
  })

  it('never goes negative', () => {
    expect(msUntilStalled(1_000, 1_000 + STREAM_IDLE_MS)).toBe(0)
    expect(msUntilStalled(1_000, 99_999)).toBe(0)
  })
})
