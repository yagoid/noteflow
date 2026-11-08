// ─────────────────────────────────────────────────────────────────────────────
// capture-kit.cjs — shared machinery of the scripts that record the real app on video
// (whats-new-capture.cjs, demo-capture.cjs, mosaic-capture.cjs): launch Electron on a throwaway profile + notes
// dir, a local mock LLM, the in-page fake cursor / keystroke pills, a human-ish actor, the CDP
// screencast recorder and the ffmpeg helpers. Nothing here touches the user's data: callers
// seed the temp dirs (see demo-notes.cjs) and never use the NoteFlow CLI.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')

const REPO = path.resolve(__dirname, '..', '..')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rand = (a, b) => a + Math.random() * (b - a)

// ── Mock OpenAI-compatible LLM (AI clip) ────────────────────────────────────
function startMockLlm(getAnswer) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }))
      return
    }
    if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        let parsed = {}
        try { parsed = JSON.parse(body) } catch { /* ignore */ }
        const msgs = parsed.messages || []
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
        const userText = typeof lastUser?.content === 'string' ? lastUser.content
          : Array.isArray(lastUser?.content) ? lastUser.content.map((p) => p.text || '').join(' ') : ''
        const text = getAnswer(userText, parsed)
        if (!parsed.stream) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }))
          return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        // Stream in small word-ish chunks with a human-ish cadence.
        const chunks = text.match(/\S+\s*|\s+/g) || [text]
        let i = 0
        const tick = () => {
          if (res.writableEnded) return
          if (i < chunks.length) {
            const n = 2 + Math.floor(Math.random() * 2)
            const piece = chunks.slice(i, i + n).join('')
            i += n
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
            setTimeout(tick, 22 + Math.random() * 30)
          } else {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
            res.write('data: [DONE]\n\n')
            res.end()
          }
        }
        setTimeout(tick, 380)
      })
      return
    }
    res.writeHead(404); res.end()
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

// ── App launch ──────────────────────────────────────────────────────────────
function launchEnv(notes) {
  const env = { ...process.env, NOTEFLOW_NATIVE: '1', NOTEFLOW_NOTES_DIR: notes, NOTEFLOW_DISABLE_WHATS_NEW: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

async function setMainBounds(app, b) {
  await app.evaluate(({ BrowserWindow }, b) => {
    const w = BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('#')) || BrowserWindow.getAllWindows()[0]
    if (w.isMaximized()) w.unmaximize()
    w.setBounds(b)
    w.show()
  }, b)
}

async function closeApp(ctx) {
  try { await ctx.app.close() } catch { /* already gone */ }
  try { fs.rmSync(ctx.tmpRoot, { recursive: true, force: true }) } catch { /* locked files: leave in temp */ }
}

// ── Overlay: fake cursor + keystroke pills (injected only during capture) ───
// `ink` = the cursor colour as an "r,g,b" string: white by default (dark themes); pass a dark one
// on light themes, where a white cursor barely shows.
const OVERLAY_SRC = ({ ink = '255,255,255' } = {}) => {
  if (window.__nfo) return
  const root = document.createElement('div')
  root.id = '__nf_capture_overlay'
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
  const style = document.createElement('style')
  style.textContent = `
    #__nf_cursor{position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
      background:radial-gradient(circle,rgba(${ink},.95) 0 4px,rgba(${ink},.35) 5px,rgba(${ink},.14) 12px,rgba(${ink},0) 13px);
      box-shadow:0 0 0 1.5px rgba(${ink},.55),0 2px 10px rgba(0,0,0,.45);opacity:0;transition:opacity .25s;will-change:transform}
    #__nf_cursor.on{opacity:1}
    .__nf_pulse{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid rgba(${ink},.85);
      animation:__nfp .5s ease-out forwards}
    @keyframes __nfp{from{transform:scale(.6);opacity:.9}to{transform:scale(2.1);opacity:0}}
    #__nf_keys{position:absolute;left:50%;bottom:34px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;
      font:600 15px/1 Inter,Segoe UI,system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .2s, transform .2s}
    #__nf_keys.on{opacity:1}
    #__nf_keys kbd{font:inherit;padding:9px 13px;border-radius:9px;background:rgba(24,24,30,.86);border:1px solid rgba(255,255,255,.22);
      box-shadow:0 6px 20px rgba(0,0,0,.4), inset 0 -2px 0 rgba(255,255,255,.08);min-width:18px;text-align:center}
    #__nf_keys span{opacity:.6;font-weight:500}`
  root.appendChild(style)
  const cur = document.createElement('div'); cur.id = '__nf_cursor'; root.appendChild(cur)
  const keys = document.createElement('div'); keys.id = '__nf_keys'; root.appendChild(keys)
  document.documentElement.appendChild(root)
  const state = { x: -50, y: -50, raf: 0, keysTimer: 0 }
  const place = (x, y) => { state.x = x; state.y = y; cur.style.transform = `translate(${x}px,${y}px)` }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  window.__nfo = {
    show(x, y) { place(x, y); cur.classList.add('on') },
    hide() { cur.classList.remove('on') },
    moveTo(x, y, ms, straight) {
      cancelAnimationFrame(state.raf)
      const sx = state.x, sy = state.y, t0 = performance.now()
      // Slight arc so the path feels hand-made.
      const dx = x - sx, dy = y - sy
      const bend = straight ? 0 : Math.min(60, Math.hypot(dx, dy) * 0.12)
      const nx = -dy / (Math.hypot(dx, dy) || 1), ny = dx / (Math.hypot(dx, dy) || 1)
      return new Promise((resolve) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms)
          const e = ease(t)
          const arc = Math.sin(Math.PI * e) * bend
          place(sx + dx * e + nx * arc, sy + dy * e + ny * arc)
          if (t < 1) state.raf = requestAnimationFrame(step)
          else resolve()
        }
        state.raf = requestAnimationFrame(step)
      })
    },
    pos() { return { x: state.x, y: state.y } },
    pulse() {
      const p = document.createElement('div'); p.className = '__nf_pulse'
      p.style.left = state.x + 'px'; p.style.top = state.y + 'px'
      root.appendChild(p); setTimeout(() => p.remove(), 600)
      cur.animate([{ transform: cur.style.transform + ' scale(1)' }, { transform: cur.style.transform + ' scale(.78)' }, { transform: cur.style.transform + ' scale(1)' }], { duration: 220 })
    },
    // Moves the keystroke pills (default: bottom-centre of the window) so they land inside a
    // tight crop: (x, y) = CSS px of the pills' bottom-centre.
    placeKeys(x, y) {
      keys.style.left = x + 'px'; keys.style.top = y + 'px'; keys.style.bottom = 'auto'
      keys.style.transform = 'translate(-50%,-100%)'
    },
    keys(list, ms) {
      keys.innerHTML = list.map((k, i) => (i ? '<span>+</span>' : '') + `<kbd>${k}</kbd>`).join('')
      keys.classList.add('on')
      clearTimeout(state.keysTimer)
      state.keysTimer = setTimeout(() => keys.classList.remove('on'), ms || 1300)
    },
  }
}

async function injectOverlay(page, opts = {}) { await page.evaluate(OVERLAY_SRC, opts) }

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Moves the real pointer from → to over `dur` ms of wall time (same easing as the fake cursor).
async function follow(page, from, to, dur, every) {
  const t0 = Date.now()
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / dur)
    const e = easeInOut(t)
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
    if (t >= 1) break
    await sleep(every)
  }
}

// Human-ish actions on a page (fake cursor animated in-page, real input via Playwright).
function actor(page) {
  const a = {
    async show(x, y) { await page.evaluate(([x, y]) => window.__nfo.show(x, y), [x, y]) },
    async hide() { await page.evaluate(() => window.__nfo.hide()) },
    async move(x, y, ms) {
      const from = await page.evaluate(() => window.__nfo.pos())
      const dist = Math.hypot(x - from.x, y - from.y)
      if (dist < 2) return
      const dur = ms ?? Math.max(380, Math.min(950, 260 + dist * 0.9))
      const anim = page.evaluate(([x, y, d]) => window.__nfo.moveTo(x, y, d), [x, y, dur])
      // Real pointer follows (time-based) so hover states light up along the way.
      await follow(page, from, { x, y }, dur, 60)
      await anim
    },
    async moveTo(locator, { dx = 0, dy = 0, ms, fx = 0.5, fy = 0.5 } = {}) {
      const b = await locator.boundingBox()
      if (!b) throw new Error('moveTo: element has no box')
      const x = b.x + b.width * fx + dx, y = b.y + b.height * fy + dy
      await a.move(x, y, ms)
      return { x, y }
    },
    async click(locator, o = {}) {
      await a.moveTo(locator, o)
      await sleep(o.pause ?? 140)
      await page.evaluate(() => window.__nfo.pulse())
      const p = await page.evaluate(() => window.__nfo.pos())
      await page.mouse.click(p.x, p.y, { button: o.button || 'left' })
      await sleep(o.after ?? 260)
    },
    async clickAt(x, y, o = {}) {
      await a.move(x, y, o.ms)
      await sleep(o.pause ?? 140)
      await page.evaluate(() => window.__nfo.pulse())
      await page.mouse.click(x, y)
      await sleep(o.after ?? 260)
    },
    async drag(locator, toX, toY, o = {}) {
      const p = await a.moveTo(locator, o)
      await a.dragFrom(p.x, p.y, toX, toY, o)
    },
    async dragFrom(fromX, fromY, toX, toY, o = {}) {
      await a.move(fromX, fromY)
      const p = { x: fromX, y: fromY }
      await sleep(180)
      await page.evaluate(() => window.__nfo.pulse())
      await page.mouse.down()
      const dur = o.ms ?? 1000
      // Straight path: whatever is dragged follows the real pointer, so the fake one must too.
      const anim = page.evaluate(([x, y, d]) => window.__nfo.moveTo(x, y, d, true), [toX, toY, dur])
      await follow(page, p, { x: toX, y: toY }, dur, 16)
      await anim
      await sleep(220)
      await page.mouse.up()
      await sleep(o.after ?? 300)
    },
    async type(text, { min = 38, max = 95 } = {}) {
      for (const ch of text) {
        await page.keyboard.type(ch)
        let d = rand(min, max)
        if (ch === ' ') d += rand(10, 50)
        if (/[.,:;!?]/.test(ch)) d += rand(80, 160)
        await sleep(d)
      }
    },
    // Shortcut with on-screen pills. `combo` like 'Control+T'.
    async keys(combo, label, ms) {
      const shown = label || combo.split('+').map((k) => ({ Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Meta: 'Cmd' }[k] || k))
      await page.evaluate(([l, ms]) => window.__nfo.keys(l, ms), [shown, ms])
      await sleep(170)
      await page.keyboard.press(combo)
    },
    async press(key, label) {
      if (label) await page.evaluate(([l]) => window.__nfo.keys(l, 900), [[label]])
      await page.keyboard.press(key)
    },
  }
  return a
}

// ── Recorder: CDP Page.startScreencast (all frames, timestamped) ────────────
async function startRecording(page, ctxForSession) {
  const session = await (ctxForSession || page.context()).newCDPSession(page)
  const frames = []
  session.on('Page.screencastFrame', (f) => {
    frames.push({ data: Buffer.from(f.data, 'base64'), ts: f.metadata.timestamp, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight })
    session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 4000, maxHeight: 4000, everyNthFrame: 1 })
  const t0 = Date.now() / 1000
  // Nudge one paint so the first frame lands immediately.
  await page.evaluate(() => { document.documentElement.style.outline = '0px solid transparent'; requestAnimationFrame(() => { document.documentElement.style.outline = '' }) })
  return {
    t0,
    async stop() {
      const t1 = Date.now() / 1000
      await session.send('Page.stopScreencast').catch(() => {})
      await sleep(100)
      await session.detach().catch(() => {})
      return { frames, t0, t1 }
    },
  }
}

// Writes frames to disk + an ffconcat with their real on-screen durations (screencast frames
// only arrive when something repaints). `cuts` = [[t0, t1], …] wall-clock spans to drop (e.g. a
// hidden setup step in the middle of a take). Returns the list path + the frame pixel size.
function writeConcat(rec, dir, { from, to, cuts = [], speed = 1 } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const start = from ?? rec.t0
  const end = to ?? rec.t1
  let firstIdx = 0
  for (let i = 0; i < rec.frames.length; i++) if (rec.frames[i].ts <= start) firstIdx = i
  const use = rec.frames.slice(firstIdx).filter((f) => f.ts < end)
  if (!use.length) throw new Error('no frames captured')
  const items = []
  use.forEach((f, i) => {
    // The first frame also covers the lead-in before the first repaint.
    const a = i === 0 ? start : Math.max(f.ts, start)
    const b = i + 1 < use.length ? Math.max(use[i + 1].ts, start) : end
    let segs = [[a, b]]
    for (const [c0, c1] of cuts) {
      segs = segs.flatMap(([s, e]) => (e <= c0 || s >= c1 ? [[s, e]] : [[s, Math.min(e, c0)], [Math.max(s, c1), e]].filter(([x, y]) => y - x > 1e-4)))
    }
    const dur = segs.reduce((acc, [s, e]) => acc + (e - s), 0)
    if (dur > 1e-4) items.push({ f, dur: dur / speed })
  })
  const lines = ['ffconcat version 1.0']
  let last = ''
  items.forEach(({ f, dur }, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`).replace(/\\/g, '/')
    fs.writeFileSync(file, f.data)
    lines.push(`file '${file}'`, `duration ${dur.toFixed(4)}`)
    last = file
  })
  // concat demuxer quirk: repeat the last file so its duration is honoured.
  lines.push(`file '${last}'`)
  const listPath = path.join(dir, 'list.ffconcat')
  fs.writeFileSync(listPath, lines.join('\n'))
  const { w, h } = jpegSize(path.join(dir, 'f00000.jpg'))
  return { listPath, frameW: w, frameH: h, duration: items.reduce((s, x) => s + x.dur, 0) }
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error}`)
}

function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return Number(r.stdout.trim())
}

function jpegSize(file) {
  // Minimal JPEG SOF parser (avoids an image dependency).
  const b = fs.readFileSync(file)
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  throw new Error('bad jpeg')
}

// Extracts n evenly spaced sample frames (<name>-<i>.png) of a finished video for visual review.
function sampleFrames(video, dir, n = 4) {
  fs.mkdirSync(dir, { recursive: true })
  const dur = probeDuration(video)
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (dur * (i + 0.5)) / n
    const file = path.join(dir, `${path.parse(video).name}-${i}.png`)
    ffmpeg(['-ss', t.toFixed(3), '-i', video, '-frames:v', '1', file])
    out.push(file)
  }
  return out
}

// TipTap applies focus() in a requestAnimationFrame: wait until the editor really has it, or the
// first keystrokes land wherever the focus was (e.g. a new note's auto-selected title).
const waitEditorFocus = (page) => page.waitForFunction(() => {
  const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
  return !!el && el.editor.view.hasFocus()
}, null, { timeout: 3000 })

const focusEditorEnd = async (page) => {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
    el.editor.commands.focus('end')
  })
  await waitEditorFocus(page)
}

// Caret at the end of the last task item, so Enter starts a new task.
const focusLastTask = async (page) => {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
    const items = el.querySelectorAll('li[data-type="taskItem"] p')
    const target = items[items.length - 1]
    const pos = el.editor.view.posAtDOM(target, target.childNodes.length)
    el.editor.chain().focus().setTextSelection(pos).run()
  })
  await waitEditorFocus(page)
}

async function configureMockLlm(ctx, port) {
  await ctx.page.evaluate((port) => window.noteflow.aiLlmSetConfig({
    active: 'openai', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'sk-demo-not-a-real-key', model: 'gpt-4o',
  }), port)
}

async function reloadMain(ctx) {
  await ctx.page.reload()
  await ctx.page.waitForLoadState('domcontentloaded')
  await ctx.page.waitForTimeout(1800)
}

// Scans the brain canvas with the (real) pointer for a note/section node: the scene shows a
// pointer cursor over clickable nodes and a full-opacity, non-bold label for the hovered
// note/section. Groups (bold label) are skipped — clicking one navigates away.
async function probeBrainNode(page, cb) {
  const hits = []
  const x0 = cb.x + cb.w * 0.2, x1 = cb.x + cb.w * 0.8, y0 = cb.y + cb.h * 0.2, y1 = cb.y + cb.h * 0.75
  for (let y = y0; y < y1; y += 13) {
    for (let x = x0; x < x1; x += 13) {
      await page.mouse.move(x, y)
      const label = await page.evaluate(() => {
        const c = [...document.querySelectorAll('canvas')].find((el) => el.style.cursor)
        if (!c || c.style.cursor !== 'pointer') return null
        const lbl = [...c.parentElement.querySelectorAll('div')].find((d) => d.style.opacity === '1' && d.style.fontWeight === '400')
        return lbl ? lbl.textContent : null
      })
      if (label) hits.push({ x, y, label })
    }
  }
  if (!hits.length) return null
  // Prefer a node near the middle of the canvas.
  const mx = cb.x + cb.w / 2, my = cb.y + cb.h / 2
  hits.sort((p, q) => Math.hypot(p.x - mx, p.y - my) - Math.hypot(q.x - mx, q.y - my))
  return hits[0]
}

// Grows a CSS-px rect to the `aspect` (w/h) around its centre and keeps it inside `bounds`
// ({ w, h }, origin 0,0); shrinks it (same aspect) if it no longer fits.
function fitAspect(rect, aspect, bounds) {
  let { x, y, w, h } = rect
  if (w / h > aspect) { const nh = w / aspect; y -= (nh - h) / 2; h = nh } else { const nw = h * aspect; x -= (nw - w) / 2; w = nw }
  const k = Math.min(1, bounds.w / w, bounds.h / h)
  if (k < 1) { x += (w - w * k) / 2; y += (h - h * k) / 2; w *= k; h *= k }
  x = Math.max(0, Math.min(bounds.w - w, x)); y = Math.max(0, Math.min(bounds.h - h, y))
  return { x, y, w, h }
}

// Seamless loop of a (lossless) clip: its last `d` s crossfade into its first `d` s, and the output
// starts right after them, so the end blends into what follows the restart (no still frame, no
// jump). Output = duration - d. `d` = 0 just copies.
function loopCrossfade(src, out, d) {
  if (!d) { fs.copyFileSync(src, out); return }
  const dur = probeDuration(src)
  ffmpeg(['-i', src, '-i', src, '-filter_complex',
    `[0:v]trim=start=${d},setpts=PTS-STARTPTS,settb=1/30[a];[1:v]trim=end=${d},setpts=PTS-STARTPTS,settb=1/30[b];` +
    `[a][b]xfade=transition=fade:duration=${d}:offset=${(dur - 2 * d).toFixed(3)}[out]`,
    '-map', '[out]', '-c:v', 'ffv1', '-an', out])
}

// ffmpeg geq expression: alpha of a rounded rectangle (radius r) filling the frame.
const roundedAlpha = (r) =>
  `255*lte(pow(max(max(${r}-X\\,X-(W-1-${r}))\\,0)\\,2)+pow(max(max(${r}-Y\\,Y-(H-1-${r}))\\,0)\\,2)\\,${r}*${r})`

function makeMask(file, w, h, r) {
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}`, '-frames:v', '1', '-vf', `format=gray,geq=lum='${roundedAlpha(r)}'`, file])
}

function makeShadow(file, w, h, m, strength) {
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${w + 2 * m}x${h + 2 * m}`, '-frames:v', '1', '-vf',
    `format=rgba,geq=r=0:g=0:b=0:a='if(between(X\\,${m}\\,W-1-${m})*between(Y\\,${m}\\,H-1-${m})\\,${strength}\\,0)',gblur=sigma=${Math.round(m / 2.4)}`, file])
}
// Wall-clock instant of a take → time in the encoded clip (after cuts and speed-up).
function clipTime(ts, t0, cuts, speed) {
  let t = ts - t0
  for (const [c0, c1] of cuts) if (c0 < ts) t -= Math.min(ts, c1) - c0
  return Math.max(0, t / speed)
}

// Launches the app in `appDir` on a throwaway profile + notes dir (under the OS temp dir).
// `seed({ notes, profile })` fills both before launch. The caller closes it with closeApp().
async function launchElectron({ appDir, scale, size, seed, tmpPrefix = 'nf-capture-' }) {
  const { _electron } = require(path.join(REPO, 'node_modules', 'playwright'))
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix))
  const profile = path.join(tmpRoot, 'profile')
  const notes = path.join(tmpRoot, 'notes')
  fs.mkdirSync(profile); fs.mkdirSync(notes)
  if (seed) await seed({ notes, profile })
  const exe = process.platform === 'win32'
    ? path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe')
    : require(path.join(REPO, 'node_modules', 'electron'))
  const app = await _electron.launch({
    executablePath: exe,
    args: [appDir, `--user-data-dir=${profile}`, `--force-device-scale-factor=${scale}`,
      '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    cwd: appDir,
    env: launchEnv(notes),
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await setMainBounds(app, { x: 60, y: 60, ...size })
  // No red squiggles under demo text.
  await app.evaluate(({ session }) => session.defaultSession.setSpellCheckerEnabled(false))
  await page.waitForTimeout(1800)
  return { app, page, tmpRoot, notes, profile, size }
}

module.exports = {
  REPO, sleep, rand, startMockLlm, launchEnv, launchElectron, setMainBounds, closeApp,
  injectOverlay, easeInOut, follow, actor, startRecording, writeConcat, ffmpeg, probeDuration, jpegSize,
  sampleFrames, waitEditorFocus, focusEditorEnd, focusLastTask, configureMockLlm, reloadMain, probeBrainNode,
  roundedAlpha, makeMask, makeShadow, clipTime, fitAspect, loopCrossfade,
}
