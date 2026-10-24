import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAiCompatibleProvider, accumulateReasoningDetails } from '../../electron/ai/llm/openaiCompatible'
import type { AgentMessage, ReasoningDetail, ResolvedLlmConfig } from '../../electron/ai/llm/types'

// With reasoning + tools, OpenRouter recommends (and DeepSeek / Anthropic thinking require)
// re-sending the assistant turn's `reasoning_details` when its tool calls are fed back. The
// provider collects them from the stream and toOpenAiMessages re-attaches them — but ONLY when
// some arrived: strict OpenAI-compatible APIs must never see the field.

const cfg: ResolvedLlmConfig = { impl: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm' }

/** fetch stub: answers every call with the given SSE chunks and records the request bodies. */
function stubFetch(chunks: string[]) {
  const bodies: Array<Record<string, unknown>> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      const encoder = new TextEncoder()
      let i = 0
      const reader = {
        read: async () =>
          i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined },
        cancel: async () => {},
      }
      return { ok: true, status: 200, statusText: 'OK', body: { getReader: () => reader } }
    })
  )
  return bodies
}

const frame = (delta: Record<string, unknown>) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n`

afterEach(() => { vi.unstubAllGlobals() })

describe('accumulateReasoningDetails', () => {
  it('merges fragments by index, concatenating text and keeping the latest signature/metadata', () => {
    const acc = new Map<number, ReasoningDetail>()
    accumulateReasoningDetails(acc, [{ type: 'reasoning.text', text: 'Let me ', format: 'anthropic-claude-v1', index: 0 }])
    accumulateReasoningDetails(acc, [{ type: 'reasoning.text', text: 'check the notes.', index: 0 }])
    accumulateReasoningDetails(acc, [{ type: 'reasoning.text', signature: 'sig==', index: 0 }])
    accumulateReasoningDetails(acc, [{ type: 'reasoning.encrypted', data: 'opaque', id: 'r1', index: 1 }])
    expect([...acc.entries()]).toEqual([
      [0, { type: 'reasoning.text', text: 'Let me check the notes.', format: 'anthropic-claude-v1', index: 0, signature: 'sig==' }],
      [1, { type: 'reasoning.encrypted', data: 'opaque', id: 'r1', index: 1 }],
    ])
  })

  it('ignores garbage without throwing; a fragment without index continues detail 0', () => {
    const acc = new Map<number, ReasoningDetail>()
    accumulateReasoningDetails(acc, 'nope')
    accumulateReasoningDetails(acc, [null, 3, 'x', []])
    expect(acc.size).toBe(0)
    accumulateReasoningDetails(acc, [{ type: 'reasoning.summary', summary: 'a' }])
    accumulateReasoningDetails(acc, [{ summary: 'b' }])
    expect(acc.get(0)).toEqual({ type: 'reasoning.summary', summary: 'ab' })
  })
})

describe('streamTurn — reasoning_details passthrough', () => {
  it('returns the reasoning streamed alongside tool calls', async () => {
    stubFetch([
      frame({ reasoning_details: [{ type: 'reasoning.text', text: 'I should ', index: 0 }] }),
      frame({ reasoning_details: [{ type: 'reasoning.text', text: 'list notes.', signature: 'sig', index: 0 }] }),
      frame({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_notes', arguments: '{}' } }] }),
      'data: [DONE]\n',
    ])
    const res = await new OpenAiCompatibleProvider(cfg).streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {})
    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'list_notes', input: {} }])
    expect(res.reasoningDetails).toEqual([{ type: 'reasoning.text', text: 'I should list notes.', signature: 'sig', index: 0 }])
  })

  it('omits reasoningDetails entirely when the stream carried none', async () => {
    stubFetch([frame({ content: 'Hello' }), 'data: [DONE]\n'])
    const res = await new OpenAiCompatibleProvider(cfg).streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {})
    expect(res).toEqual({ text: 'Hello', toolCalls: [] })
  })

  it('re-sends reasoning_details on the assistant tool-call turn, and nowhere else', async () => {
    const bodies = stubFetch([frame({ content: 'Done.' }), 'data: [DONE]\n'])
    const details: ReasoningDetail[] = [{ type: 'reasoning.text', text: 'thinking', signature: 'sig', index: 0 }]
    const messages: AgentMessage[] = [
      { role: 'user', content: 'Tidy my notes' },
      { role: 'assistant', content: 'Earlier answer' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'list_notes', input: {} }],
        reasoningDetails: details,
      },
      { role: 'tool', results: [{ toolCallId: 'call_1', content: '[]' }] },
    ]
    await new OpenAiCompatibleProvider(cfg).streamTurn({ messages }, () => {})
    const sent = bodies[0].messages as Array<Record<string, unknown>>
    expect(sent[2]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_notes', arguments: '{}' } }],
      reasoning_details: details,
    })
    // Plain assistant turns and the rest never carry the field.
    for (const i of [0, 1, 3]) expect(sent[i]).not.toHaveProperty('reasoning_details')
  })

  it('a tool-call turn without reasoning sends no reasoning_details field (strict OpenAI-compatible APIs)', async () => {
    const bodies = stubFetch([frame({ content: 'ok' }), 'data: [DONE]\n'])
    await new OpenAiCompatibleProvider(cfg).streamTurn(
      {
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'list_notes', input: {} }], reasoningDetails: [] },
          { role: 'tool', results: [{ toolCallId: 'c', content: '[]' }] },
        ],
      },
      () => {}
    )
    const sent = bodies[0].messages as Array<Record<string, unknown>>
    expect(sent[1]).not.toHaveProperty('reasoning_details')
    expect(bodies[0]).not.toHaveProperty('reasoning')
  })
})
