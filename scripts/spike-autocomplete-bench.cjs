// SPIKE (throwaway): latency/cost benchmark for inline AI autocomplete through the
// managed NoteFlow AI proxy (supabase/functions/ai-proxy, OpenAI-compatible).
//
//   node scripts/spike-autocomplete-bench.cjs [--smoke] [--out <file.json>]
//
// Uses the CLI's NoteFlow account session (cli/noteflow.js getCloudAccessToken, which
// persists the rotated refresh token). Requests are strictly sequential and capped
// (MAX_REQUESTS): the account has a monthly budget. The token is never printed.
'use strict'

const fs = require('fs')
const path = require('path')
const cli = require('../cli/noteflow.js')

const AI_PROXY_URL = 'https://bolnhekicavuzscdjoty.supabase.co/functions/v1/ai-proxy'
const MODELS = ['deepseek/deepseek-v4.1-flash-1017', 'anthropic/claude-haiku-5.5']
const MAX_REQUESTS = 42
const MAX_TOKENS = 40
// DeepSeek reasons before answering and the proxy drops the client's `reasoning` knob, so
// 40 tokens are spent entirely on reasoning (empty content). Measured with a larger cap too.
const REASONING_MAX_TOKENS = 400

// The prompt the numbers were measured with. The prototype (electron/ai/autocomplete.ts)
// adds one instruction on top — echo the last word — to fix the missing leading space
// seen in these runs; that variant was NOT benchmarked.
const SYSTEM = [
  'You are an inline autocomplete engine inside a note-taking app.',
  'Continue the user\'s text from the exact position marked <CURSOR/>.',
  'Reply with ONLY the continuation: at most one sentence (or the rest of the current list item), in the same language and tone as the text.',
  'Never repeat text that is already written, never explain, never use quotes or markdown fences.',
  'If the text before the cursor ends in the middle of a word, finish that word; otherwise start with a space when one is needed.',
  'Do not run into the text after the cursor.',
].join(' ')

function buildUser(before, after) {
  return after ? `${before}<CURSOR/>${after}` : `${before}<CURSOR/>`
}

// ── Sample notes (text before the cursor; some with text after it) ────────────
const SAMPLES = [
  {
    id: 'es-reunion',
    before: `Reunión de planificación del trimestre

Asistentes: Marta, Julián, Sofía y yo. Empezamos repasando lo que quedó pendiente del trimestre anterior. El rediseño de la página de precios se entregó con tres semanas de retraso, sobre todo porque el equipo de diseño estuvo bloqueado esperando los textos legales, y eso arrastró también la campaña de correo que dependía de ella. Marta insistió en que no podemos volver a planificar entregas que dependan de terceros sin dejar un margen razonable, y propuso que cada proyecto tenga un responsable único que se encargue de perseguir esas dependencias desde el primer día.

Después hablamos de prioridades. Julián quiere dedicar al menos la mitad del trimestre a reducir la deuda técnica del módulo de facturación, porque cada cambio pequeño está costando el doble de lo previsto y los errores en producción se han duplicado desde enero. Sofía no está de acuerdo del todo: cree que si paramos las funcionalidades nuevas durante seis semanas perderemos a dos clientes grandes que llevan meses pidiendo la exportación a contabilidad. Al final acordamos un reparto intermedio, con cuatro semanas de limpieza y el resto para la exportación, siempre que el alcance de esta última se reduzca a los dos formatos más pedidos.

Sobre contratación, hay presupuesto aprobado para una persona más en backend, pero el proceso anterior tardó casi cuatro meses. Para esta vez la idea es`,
    after: '',
  },
  {
    id: 'en-essay',
    before: `Notes on why small teams ship faster

I keep coming back to the same observation: the teams I have seen move quickly were almost never the ones with the best tooling or the most senior people. What they had in common was that every person could hold the whole system in their head, and that decisions were made by whoever was closest to the problem. When a team grows past seven or eight people that stops being true. Suddenly you need documents to explain what used to be obvious, meetings to agree on what used to be decided in a hallway, and a roadmap to keep everyone from stepping on each other.

None of that is bad by itself. Documents outlive the people who wrote them, and a roadmap forces you to say no to things. The cost is latency. A question that used to take thirty seconds now takes a day, because the person who knows the answer is in another meeting, and the person asking does not feel entitled to interrupt. Multiply that by every small decision in a week and you get a team that is busy all the time and still surprised by how little shipped.

The usual response is to add process: more planning, more check-ins, a new tool for tracking dependencies. In my experience that makes the latency worse, because each layer of coordination is itself something that has to be coordinated. The teams that recovered their speed did the opposite. They split into smaller groups with clear ownership, and they accepted that`,
    after: `

There is a second effect that is harder to measure. People in small teams feel responsible for the outcome, not just for their ticket, and that changes how carefully they`,
  },
  {
    id: 'es-lista',
    before: `# Mudanza a Valencia

## Antes de irnos
- [x] Avisar al casero con un mes de antelación y pedir que nos confirme por escrito la fecha de entrega de llaves
- [x] Pedir tres presupuestos de empresas de mudanzas y comparar si incluyen el embalaje y el seguro
- [x] Dar de baja el contrato de la luz y el gas para el día 30
- [ ] Cambiar la dirección en el banco, en Hacienda y en la mutua
- [ ] Vender el sofá viejo y la mesa del salón, que no caben en el piso nuevo
- [ ] Hacer fotos del estado del piso para recuperar la fianza sin discusiones

## Piso nuevo
- [x] Firmar el contrato y pagar la fianza
- [ ] Contratar internet (preguntar a los vecinos qué compañía va mejor en el edificio)
- [ ] Medir el hueco de la lavadora y el de la nevera antes de comprar nada
- [ ] Empadronarnos en el ayuntamiento, que hace falta para el médico y para el colegio de la niña
- [ ] Buscar un trastero cerca para las cajas de libros

## Primera semana
- [ ] Montar las camas y la cocina lo primero, el resto puede esperar
- [ ] Presentarnos a los vecinos del rellano
- [ ] Localizar el centro de salud, la farmacia de guardia y el mercado
- [ ] Llevar el coche a`,
    after: '',
  },
  {
    id: 'en-tech',
    before: `Debugging log: intermittent sync failures

Started seeing reports on Monday that notes edited on the laptop sometimes do not show up on the phone until the app is restarted. It is not reproducible on demand, which made me suspect a race rather than a plain bug. First thing I checked was the server logs: every failed case has a successful upload from the laptop, so the data does reach the backend. The problem is on the way down.

The phone keeps a cursor with the last sequence number it has seen and asks for everything after it. If two uploads land within the same millisecond, they can be committed out of order, so a row with a lower sequence number becomes visible after the client has already advanced past it. That row is then skipped forever, or at least until a full resync. This matches the reports: it only happens to people who edit several sections quickly, and a restart fixes it because the app does a full pull on launch.

I tried two fixes. The first was to make the client re-read a small window behind its cursor on every pull, which works but feels like papering over the real issue and costs an extra query each time. The second was to assign the sequence number inside the same transaction that takes a per-user lock, so commits for one user can never interleave. That one is cleaner, although it means`,
    after: `

Next steps: write a test that fires fifty concurrent uploads for the same user and asserts that the pulled sequence has no gaps.`,
  },
  {
    id: 'es-diario',
    before: `Diario — domingo

Hoy por fin subimos al pico que llevábamos todo el verano aplazando. Salimos del aparcamiento a las siete, con frío y con la niebla todavía pegada al valle, y durante la primera hora casi no hablamos. El sendero empieza suave, entre hayas, y luego se empina de golpe cuando se acaba el bosque. Ahí fue donde Pablo empezó a quejarse de la rodilla, aunque no quiso darse la vuelta.

A media mañana la niebla se abrió y se vio todo el circo glaciar, con el lago abajo, de un color que no sé describir, entre verde y gris. Paramos a comer algo en un collado donde soplaba un viento helado. Me di cuenta de que hacía meses que no pasaba tantas horas seguidas sin mirar el teléfono, y de que no lo echaba de menos en absoluto. Es curioso lo rápido que la cabeza se vacía cuando lo único que hay que decidir es dónde poner el pie.

La última parte es una pedrera incómoda, de esas en las que avanzas dos pasos y resbalas uno. Llegamos arriba pasado el mediodía. No había nadie más, solo un par de buitres dando vueltas muy por debajo de nosotros. Nos quedamos un buen rato sentados sin decir nada, y pensé que deberíamos hacer esto mucho más a menu`,
    after: '',
  },
]

function shortContext(before) {
  return before.slice(-600)
}

// ── One request ───────────────────────────────────────────────────────────────
async function runOne(token, { model, sample, variant, stream, maxTokens }) {
  const before = variant === 'short' ? shortContext(sample.before) : sample.before
  const after = variant === 'short' ? '' : sample.after
  const body = {
    model,
    stream,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUser(before, after) },
    ],
  }
  const out = {
    model, sample: sample.id, variant, stream, maxTokens,
    contextChars: before.length + after.length,
    status: 0, errorCode: null,
    headersMs: null, firstDeltaMs: null, ttftMs: null, totalMs: null,
    chars: 0, text: '', reasoningFirst: false, reasoningChars: 0,
    usage: null, quotaUsed: null, quotaLimit: null, finishReason: null,
    tail: before.slice(-90),
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  const t0 = performance.now()
  try {
    const res = await fetch(`${AI_PROXY_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    out.headersMs = Math.round(performance.now() - t0)
    out.status = res.status
    out.quotaUsed = Number(res.headers.get('x-noteflow-tokens-used')) || null
    out.quotaLimit = Number(res.headers.get('x-noteflow-tokens-limit')) || null
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      try { out.errorCode = JSON.parse(detail).error.code || JSON.parse(detail).error.type } catch { out.errorCode = detail.slice(0, 120) }
      out.totalMs = Math.round(performance.now() - t0)
      return out
    }
    if (!stream) {
      const json = await res.json()
      out.totalMs = Math.round(performance.now() - t0)
      const msg = json.choices && json.choices[0] && json.choices[0].message
      out.text = (msg && msg.content) || ''
      out.reasoningChars = ((msg && msg.reasoning) || '').length
      out.reasoningFirst = out.reasoningChars > 0
      out.finishReason = json.choices && json.choices[0] && json.choices[0].finish_reason
      out.usage = json.usage || null
      out.chars = out.text.length
      return out
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let finished = false
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { finished = true; break }
        let json
        try { json = JSON.parse(data) } catch { continue }
        if (json.error) { out.errorCode = `stream:${json.error.code || json.error.type || 'error'}`; continue }
        if (json.usage) out.usage = json.usage
        const choice = json.choices && json.choices[0]
        if (!choice) continue
        if (choice.finish_reason) out.finishReason = choice.finish_reason
        const delta = choice.delta || {}
        const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : ''
        if ((reasoning || delta.content) && out.firstDeltaMs === null) out.firstDeltaMs = Math.round(performance.now() - t0)
        if (reasoning) {
          out.reasoningChars += reasoning.length
          if (out.ttftMs === null) out.reasoningFirst = true
        } else if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length && out.ttftMs === null) {
          out.reasoningFirst = true
        }
        if (delta.content) {
          if (out.ttftMs === null) out.ttftMs = Math.round(performance.now() - t0)
          out.text += delta.content
        }
      }
    }
    out.totalMs = Math.round(performance.now() - t0)
    out.chars = out.text.length
    return out
  } catch (err) {
    out.errorCode = `exception:${err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || err}`
    out.totalMs = Math.round(performance.now() - t0)
    return out
  } finally {
    clearTimeout(timer)
  }
}

async function getUsage(token) {
  try {
    const res = await fetch(`${AI_PROXY_URL}/usage`, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) return { error: res.status }
    return await res.json()
  } catch (err) {
    return { error: String(err && err.message) }
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function pct(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}
function stats(values) {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  return { n: v.length, min: v[0], p50: pct(v, 50), p90: pct(v, 90), max: v[v.length - 1] }
}
function fmt(s) {
  return s ? `p50 ${s.p50} · p90 ${s.p90} · min ${s.min} · max ${s.max} (n=${s.n})` : 'n/a'
}
function reasoningTokens(r) {
  const d = r.usage && r.usage.completion_tokens_details
  return d && typeof d.reasoning_tokens === 'number' ? d.reasoning_tokens : null
}
function avg(values) {
  const v = values.filter((x) => typeof x === 'number')
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

async function main() {
  const args = process.argv.slice(2)
  const smoke = args.includes('--smoke')
  const outIdx = args.indexOf('--out')
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null

  let token
  try {
    token = await cli.getCloudAccessToken()
  } catch (err) {
    console.error(`No usable CLI session: ${err.message}`)
    process.exitCode = 2
    return
  }

  // Plan: 20 requests per model (first of each = cold start, reported apart).
  const plan = []
  for (const model of MODELS) {
    if (smoke) { plan.push({ model, variant: 'long', stream: true, sample: SAMPLES[0], maxTokens: MAX_TOKENS }); continue }
    const reasons = model.startsWith('deepseek/')
    const maxTokens = reasons ? REASONING_MAX_TOKENS : MAX_TOKENS
    // Reasoning model: 3 requests at the tight cap (to confirm they come back empty), the rest with room.
    if (reasons) for (let i = 0; i < 3; i++) plan.push({ model, variant: 'long', stream: true, sample: SAMPLES[i + 1], maxTokens: MAX_TOKENS })
    for (let i = 0; i < (reasons ? 10 : 12); i++) plan.push({ model, variant: 'long', stream: true, sample: SAMPLES[i % SAMPLES.length], maxTokens })
    for (let i = 0; i < (reasons ? 4 : 5); i++) plan.push({ model, variant: 'short', stream: true, sample: SAMPLES[i % SAMPLES.length], maxTokens })
    for (let i = 0; i < 3; i++) plan.push({ model, variant: 'long', stream: false, sample: SAMPLES[(i + 1) % SAMPLES.length], maxTokens })
  }
  if (plan.length > MAX_REQUESTS) throw new Error(`Plan has ${plan.length} requests (cap ${MAX_REQUESTS})`)

  const usageBefore = await getUsage(token)
  console.log(`usage before: ${JSON.stringify(usageBefore)}`)
  const results = []
  const usageByModel = {}
  let lastModel = null
  for (const step of plan) {
    if (step.model !== lastModel) {
      if (lastModel) {
        await new Promise((r) => setTimeout(r, 2500)) // let the last reservation settle
        usageByModel[lastModel].after = await getUsage(token)
      }
      usageByModel[step.model] = { before: await getUsage(token) }
      lastModel = step.model
    }
    const r = await runOne(token, step)
    r.cold = results.filter((x) => x.model === step.model).length === 0
    results.push(r)
    const u = r.usage || {}
    console.log(
      `${r.model.split('/')[1].padEnd(28)} ${r.variant.padEnd(5)} max ${String(r.maxTokens).padEnd(3)} ${r.stream ? 'sse ' : 'json'} ${String(r.status).padEnd(3)} ` +
      `hdr ${String(r.headersMs).padStart(5)} first ${String(r.firstDeltaMs).padStart(5)} ttft ${String(r.ttftMs).padStart(5)} total ${String(r.totalMs).padStart(5)} ` +
      `chars ${String(r.chars).padStart(3)} in ${u.prompt_tokens ?? '-'} out ${u.completion_tokens ?? '-'} (reasoning ${reasoningTokens(r) ?? '-'}) fin ${r.finishReason} cost ${u.cost ?? '-'}` +
      `${r.reasoningFirst ? ' REASONING' : ''}${r.errorCode ? ` ERR ${r.errorCode}` : ''}${r.cold ? ' (cold)' : ''}`
    )
    if (r.errorCode === 'monthly_quota_exceeded') { console.error('Monthly quota exhausted — stopping.'); break }
    await new Promise((r2) => setTimeout(r2, 400))
  }
  await new Promise((r) => setTimeout(r, 2500))
  if (lastModel) usageByModel[lastModel].after = await getUsage(token)
  const usageAfter = await getUsage(token)
  console.log(`usage after:  ${JSON.stringify(usageAfter)}`)

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {}
  for (const model of MODELS) {
    summary[model] = {}
    const groups = []
    for (const mt of [...new Set(results.filter((r) => r.model === model).map((r) => r.maxTokens))]) {
      groups.push([`long-stream-max${mt}`, (r) => r.variant === 'long' && r.stream && r.maxTokens === mt])
      groups.push([`short-stream-max${mt}`, (r) => r.variant === 'short' && r.stream && r.maxTokens === mt])
      groups.push([`long-json-max${mt}`, (r) => r.variant === 'long' && !r.stream && r.maxTokens === mt])
    }
    for (const [key, filter] of groups) {
      const all = results.filter((r) => r.model === model && filter(r))
      if (!all.length) continue
      const ok = all.filter((r) => r.status === 200 && !r.errorCode && !r.cold)
      const cold = all.find((r) => r.cold)
      summary[model][key] = {
        requests: all.length,
        errors: all.filter((r) => r.status !== 200 || r.errorCode).map((r) => `${r.status}:${r.errorCode}`),
        cold: cold ? { headersMs: cold.headersMs, ttftMs: cold.ttftMs, totalMs: cold.totalMs } : null,
        headersMs: stats(ok.map((r) => r.headersMs)),
        firstDeltaMs: stats(ok.map((r) => r.firstDeltaMs)),
        ttftMs: stats(ok.map((r) => r.ttftMs)),
        totalMs: stats(ok.map((r) => r.totalMs)),
        avgChars: avg(ok.map((r) => r.chars)),
        avgTokensIn: avg(ok.map((r) => r.usage && r.usage.prompt_tokens)),
        avgTokensOut: avg(ok.map((r) => r.usage && r.usage.completion_tokens)),
        avgReasoningTokens: avg(ok.map(reasoningTokens)),
        truncated: ok.filter((r) => r.finishReason === 'length').length,
        avgCostUsd: avg(ok.map((r) => r.usage && r.usage.cost)),
        reasoningFirst: ok.filter((r) => r.reasoningFirst).length,
        emptyText: ok.filter((r) => !r.text.trim()).length,
      }
      const s = summary[model][key]
      console.log(`\n== ${model} · ${key} (${all.length} req, ${s.errors.length} errors, cold excluded) ==`)
      console.log(`  headers: ${fmt(s.headersMs)}`)
      console.log(`  1st delta (incl. reasoning): ${fmt(s.firstDeltaMs)}`)
      console.log(`  ttft:    ${fmt(s.ttftMs)}`)
      console.log(`  total:   ${fmt(s.totalMs)}`)
      console.log(`  avg chars ${s.avgChars && s.avgChars.toFixed(0)} · avg in ${s.avgTokensIn && s.avgTokensIn.toFixed(0)} · avg out ${s.avgTokensOut && s.avgTokensOut.toFixed(0)} (reasoning ${s.avgReasoningTokens && s.avgReasoningTokens.toFixed(0)}) · avg cost $${s.avgCostUsd && s.avgCostUsd.toFixed(6)} · truncated(length) ${s.truncated} · reasoning-first ${s.reasoningFirst} · empty ${s.emptyText}`)
      if (cold) console.log(`  cold start (excluded): hdr ${cold.headersMs} ttft ${cold.ttftMs} total ${cold.totalMs}`)
    }
    console.log(`  quota (GET /usage) before/after this model: ${JSON.stringify(usageByModel[model])}`)
  }

  console.log('\n== samples (context tail → suggestion) ==')
  for (const r of results) {
    if (r.status !== 200) continue
    console.log(`[${r.model.split('/')[1]} · ${r.sample} · ${r.variant} · max${r.maxTokens}${r.stream ? '' : ' · json'}] …${JSON.stringify(r.tail.slice(-60))} → ${JSON.stringify(r.text)}`)
  }

  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify({ usageBefore, usageAfter, usageByModel, summary, results }, null, 2))
    console.log(`\nwrote ${outFile}`)
  }
}

main().catch((err) => { console.error(err && err.message); process.exitCode = 1 })
