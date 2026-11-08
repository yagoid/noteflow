// ─────────────────────────────────────────────────────────────────────────────
// demo-capture.cjs — records the showcase video of the landing page (and the README GIF) from
// the real app, driven by a fixed script over the demo notebook. Machinery: lib/capture-kit.cjs.
//
// Usage:
//   node scripts/demo-capture.cjs [--app <dir>] [--theme dark|light|all] [--video-out <dir>]
//                                 [--shots-out <dir>] [--samples <dir>] [--frames <dir>] [--no-gif]
//
//   --app        app dir to launch (needs a built dist/ + dist-electron/). Default: repo root.
//   --theme      dark (Midnight Blue) | light (Arctic Day) | all (default).
//   --video-out  default docs/public/video → demo-<theme>.mp4 + demo-<theme>.webm.
//   --shots-out  default docs/public/screenshots → the poster (app-main-midnightblue.png /
//                app-main-articday.png) and, for the dark take, demo-dark.gif (README).
//   --samples    write 8 sample PNGs per theme here (visual review).
//   --frames     keep the raw captured frames + intermediates here (debug); default: temp, deleted.
//   --no-gif     skip the README GIF.
//
// The take (~33 s, UI in English): the note's section map → switch section and add a task →
// "/" inserts a custom snippet → sidebar: a note's folded map unfolds and resting on a cell shows
// the landscape section preview → resting on a collapsed group peeks at its notes → a folder gets
// a custom icon from its context menu → Ctrl+S pops the section out as a sticky (composited over
// the main window) and its title dropdown switches section → the brain view + an AI chat answer
// with its cited notes. The end crossfades into the first frame so the loop restarts cleanly.
// The GIF is a ~12 s montage of the liveliest parts (hard cuts).
//
// Effects / safety (same rules as whats-new-capture.cjs):
//   - Throwaway Electron profile + notes dir under the OS temp dir, deleted at the end. Demo notes
//     are seeded as v2 folders written directly — never through the NoteFlow CLI (it would push
//     to the real NoteFlow Cloud account). No GitHub / Cloud connection.
//   - The chat talks to a local OpenAI-compatible mock (127.0.0.1, fake key). The local semantic
//     index is enabled for real (so the answer cites sources): the embeddings model is copied from
//     .electron-dev/ai-models if it is there; otherwise the app downloads it on first use (~130 MB).
//   - Only the Electron processes launched here are closed. Windows open on screen while
//     recording: do not use the mouse/keyboard on them meanwhile.
//   - Capture = CDP screencast at DPR 1.5 → 1280×820, 30 fps. webm = VP9, mp4 = H.264 (faststart),
//     posters = 256-colour PNG, GIF = 760 px wide with its own palette (≤ ~5 MB).
//   Requires: playwright (devDependency) and ffmpeg in the PATH. Review the result by eye.
// ─────────────────────────────────────────────────────────────────────────────
const HELP_LINES = 38

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  REPO, sleep, startMockLlm, launchElectron, closeApp, injectOverlay, actor, startRecording, writeConcat,
  ffmpeg, probeDuration, sampleFrames, focusEditorEnd, configureMockLlm, reloadMain, makeMask, makeShadow, clipTime,
} = require('./lib/capture-kit.cjs')
const { ID, demoContent, seedNotes } = require('./lib/demo-notes.cjs')

const SIZE = { width: 1120, height: 717 } // CSS px of the window (≈ the 1280×820 frame, scaled)
const OUT_W = 1280
const OUT_H = 820
const SPEED = 1.2 // playback speed-up of the take
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' // smallest multilingual embeddings model
const STICKY = { x: 735, y: 236, width: 345, height: 330 } // sticky bounds, relative to the main window

const THEMES = {
  dark: { id: 'midnight-blue', video: 'demo-dark', poster: 'app-main-midnightblue.png', gif: 'demo-dark.gif', ink: '255,255,255' },
  light: { id: 'arctic-day', video: 'demo-light', poster: 'app-main-articday.png', gif: null, ink: '22,34,58' },
}

function parseArgs(argv) {
  const o = {
    app: REPO, theme: 'all', videoOut: path.join(REPO, 'docs', 'public', 'video'),
    shotsOut: path.join(REPO, 'docs', 'public', 'screenshots'), samples: null, frames: null, gif: true, scale: 1.5,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--app') o.app = path.resolve(next())
    else if (a === '--theme') o.theme = next()
    else if (a === '--video-out') o.videoOut = path.resolve(next())
    else if (a === '--shots-out') o.shotsOut = path.resolve(next())
    else if (a === '--samples') o.samples = path.resolve(next())
    else if (a === '--frames') o.frames = path.resolve(next())
    else if (a === '--no-gif') o.gif = false
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, HELP_LINES).join('\n')); process.exit(0) }
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (!['dark', 'light', 'all'].includes(o.theme)) throw new Error('--theme must be dark, light or all')
  return o
}

// ── Demo notebook (English) ──────────────────────────────────────────────────
const TEXT = {
  extra: {
    [ID.launch]: [
      { id: 'sfaqxx', name: 'Launch FAQ', content: '- Is there a free plan? **Yes**, forever.\n- Does it work offline? Every note is a plain Markdown file.\n- Can I import from Notion? Yes — Settings → Import.' },
      { id: 'spress', name: 'Press kit', content: '- [x] Logo pack (SVG + PNG)\n- [ ] Product screenshots\n- [ ] Founder quote' },
    ],
    [ID.hiring]: [
      { id: 'shirx0', name: 'Offers', content: '- Ana — offer sent, answer by Friday' },
      { id: 'shirx1', name: 'Onboarding', content: '- [ ] Laptop + accounts\n- [ ] First-week buddy' },
    ],
  },
  snippets: [
    { name: 'Daily standup', content: '### Standup — {date:dddd, MMMM D}\n\n- **Yesterday:** wrapped up the pricing page\n- **Today:** launch checklist\n- **Blockers:** none' },
    { name: 'Meeting', content: '## Meeting — {date:DD-MM-YYYY}\n\n**Attendees:** \n\n- [ ] ' },
    { name: 'Signature', content: '— Alex, {date:DD-MM-YYYY}' },
  ],
  newTask: 'Ship the landing page',
  snippetQuery: 'stand',
  question: 'Summarize the launch plan',
  answer: 'The **Q4 launch** ships in three waves, two weeks apart:\n\n1. **Wave 1** — private beta with 50 design partners\n2. **Wave 2** — waitlist + pricing page go live\n3. **Wave 3** — public launch with the press kit\n\nLock down the API *Endpoints* and the design-system *Components* first.',
  ui: {
    openBrain: 'Open brain view', closeBrain: 'Close brain view', changeIcon: 'Change icon', iconPick: 'Projects', switchSection: 'Switch section',
  },
}

function seed(theme) {
  return ({ notes, profile }) => {
    seedNotes(notes, 'en', TEXT.extra, (c) => {
      // No favourites: the sidebar shows the groups (and the collapsed ones) without scrolling.
      for (const n of c.notes) delete n.favorited
    })
    fs.writeFileSync(path.join(notes, 'snippets.json'), JSON.stringify(TEXT.snippets.map((sn, i) => ({
      id: `snipdem${i}`, name: sn.name, content: sn.content, createdAt: new Date().toISOString(), ...(i === 0 ? { isDefault: true } : {}),
    })), null, 2))
    const cached = path.join(REPO, '.electron-dev', 'ai-models', ...MODEL.split('/'))
    if (fs.existsSync(cached)) fs.cpSync(cached, path.join(profile, 'ai-models', ...MODEL.split('/')), { recursive: true })
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
      language: 'en', theme: theme.id, openAtLogin: false,
      uiState: {
        activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'pinned',
        collapsedGroupIds: [ID.gPersonal, ID.gLearn], collapsedFolderIds: [ID.fEng],
      },
    }, null, 2))
  }
}

// ── The take ─────────────────────────────────────────────────────────────────
async function take(ctx, theme) {
  const { app, page } = ctx
  const a = actor(page)
  const now = () => Date.now() / 1000
  const marks = {}
  const mark = (name) => { marks[name] = now() }
  const cuts = []
  const groupName = (id) => demoContent('en').groups.find((g) => g.id === id).name
  const folderName = (id) => demoContent('en').folders.find((f) => f.id === id).name

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
  const rec = await startRecording(page)
  // The cursor fades in after the first frame: that frame is the poster and where the loop lands.
  await sleep(300)
  await a.show(760, 470)
  await sleep(500)

  // 1 · The note's section map: open another section and add a task.
  mark('tabs')
  await a.click(page.locator('.section-map-tab', { hasText: 'Tasks' }).first(), { fx: 0.4, after: 500 })
  await a.click(page.locator('.ProseMirror li[data-type="taskItem"] p').last(), { fx: 0.97, after: 120 })
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await a.type(TEXT.newTask, { min: 28, max: 60 })
  await sleep(450)

  // 2 · "/" lists the custom snippets too.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await sleep(150)
  await a.type('/', { min: 10, max: 20 })
  await sleep(750)
  await a.type(TEXT.snippetQuery, { min: 70, max: 110 })
  await sleep(550)
  await a.press('Enter', '↵')
  await sleep(1000)

  // 3 · Sidebar: a note's folded map unfolds; resting on a cell shows the section preview.
  mark('map')
  const line = await a.moveTo(page.locator(`button[data-note-id="${ID.hiring}"] .nsm-line`).first(), { fx: 0.3, ms: 850 })
  await page.locator('.nsm-peek .nsm-cell').first().waitFor({ timeout: 4000 })
  await sleep(600)
  await a.move(line.x + 40, line.y + 2, 300)
  await a.moveTo(page.locator('.nsm-peek .nsm-cell', { hasText: 'Interview loop' }).first(), { fx: 0.45, ms: 450 })
  await page.locator('.section-hover-card').first().waitFor({ timeout: 4000 })
  await sleep(1500)

  // Resting on a collapsed group peeks at its notes.
  const personal = page.locator('.sbg-ghb').filter({ has: page.locator('.sbg-gname', { hasText: groupName(ID.gPersonal) }) }).first()
  await a.moveTo(personal, { fx: 0.7, ms: 800 })
  await page.locator('[data-peek-index]').first().waitFor({ timeout: 4000 })
  await sleep(700)
  await a.moveTo(page.locator('[data-peek-index="2"]').first(), { fx: 0.5, fy: 0.3, ms: 550 })
  await sleep(700)
  mark('peekEnd')

  // A folder gets a custom icon from its context menu.
  const folder = page.locator('.sbg-fh', { hasText: folderName(ID.fProduct) }).first()
  await a.click(folder, { fx: 0.3, button: 'right', after: 420 })
  await a.click(page.getByText(TEXT.ui.changeIcon, { exact: true }).first(), { fx: 0.3, after: 380 })
  await a.click(page.locator(`button[aria-label="${TEXT.ui.iconPick}"]`).first(), { after: 300 })
  await a.move(560, 520, 650)
  await sleep(500)

  // 4 · Ctrl+S pops the section out as a sticky; its title dropdown switches section.
  await focusEditorEnd(page)
  const winP = app.waitForEvent('window')
  await a.keys('Control+S')
  const sticky = await winP
  await sticky.waitForLoadState('domcontentloaded')
  await sticky.waitForSelector('.ProseMirror')
  const layout = await app.evaluate(({ BrowserWindow }, S) => {
    const all = BrowserWindow.getAllWindows()
    const main = all.find((w) => !w.webContents.getURL().includes('#'))
    const st = all.find((w) => w.webContents.getURL().includes('#sticky'))
    const m = main.getContentBounds()
    st.setBounds({ x: m.x + S.x, y: m.y + S.y, width: S.width, height: S.height })
    return { main: m, sticky: st.getContentBounds() }
  }, STICKY)
  await sleep(250)
  await injectOverlay(sticky, { ink: theme.ink })
  const srec = await startRecording(sticky)
  await sleep(700)
  const s = actor(sticky)
  const trigger = sticky.locator(`button[title="${TEXT.ui.switchSection}"]`).first()
  const tb = await trigger.boundingBox()
  const off = { x: layout.sticky.x - layout.main.x, y: layout.sticky.y - layout.main.y }
  const target = { x: tb.x + tb.width * 0.4, y: tb.y + tb.height / 2 }
  // Hand the cursor over to the sticky at the same on-screen spot.
  await a.move(target.x + off.x, target.y + off.y, 800)
  await a.hide()
  await s.show(target.x, target.y)
  mark('sticky')
  await s.click(trigger, { fx: 0.4, ms: 120, after: 650 })
  await s.moveTo(sticky.locator('[role="menuitemradio"]', { hasText: 'Launch FAQ' }).first(), { fx: 0.35, ms: 450 })
  await sleep(250)
  await s.click(sticky.locator('[role="menuitemradio"]', { hasText: 'Roadmap' }).first(), { fx: 0.35, ms: 450, after: 300 })
  await s.move(target.x + 30, target.y + 150, 600)
  mark('stickyDone')
  await sleep(900)
  // Hidden step (cut): close the sticky, back to the main window; reload the embeddings model (the
  // worker drops it after 10 s idle and its loading toast would show up under the answer).
  const c0 = now()
  const stickyEnd = c0
  const stickyRec = await srec.stop()
  await app.evaluate(({ BrowserWindow }) => {
    const st = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('#sticky'))
    if (st) st.close()
    BrowserWindow.getAllWindows()[0].focus()
  })
  await page.evaluate(() => window.noteflow.aiSearch('launch plan', 3))
  await sleep(400)
  await a.show(target.x + off.x + 30, target.y + off.y + 150)
  await sleep(100)
  cuts.push([c0, now()])

  // 5 · The brain view + an AI answer with its cited notes.
  await sleep(200)
  await a.click(page.locator(`button[title="${TEXT.ui.openBrain}"]`).first(), { after: 1300 })
  const cb = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width - x.width)[0]
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const cx = cb.x + cb.w * 0.5, cy = cb.y + cb.h * 0.5
  await a.dragFrom(cx - 40, cy + 20, cx + 110, cy + 50, { ms: 900, after: 250 })
  await a.click(page.locator('textarea').last(), { fx: 0.3, after: 120 })
  await a.type(TEXT.question, { min: 24, max: 50 })
  await sleep(150)
  await a.press('Enter', '↵')
  mark('asked')
  const tail = TEXT.answer.replace(/[*_`#]/g, '').slice(-14)
  await page.waitForFunction((tail) => document.body.innerText.includes(tail), tail, { timeout: 20000 }).catch(() => {})
  mark('answered')
  await sleep(600)
  await a.move(cx - 60, cy + 120, 800)
  await sleep(1500)
  return { rec: await rec.stop(), sticky: stickyRec, stickyEnd, layout, cuts, marks }
}

// ── Encoding ─────────────────────────────────────────────────────────────────
// Main window frames (+ the sticky composited over it at its real offset) → lossless 1280×820.
function encodeMaster(result, work, scale) {
  const { rec, sticky, stickyEnd, layout, cuts } = result
  const main = writeConcat(rec, path.join(work, 'main'), { cuts, speed: SPEED })
  const master = path.join(work, 'master.mkv')
  if (!sticky || !sticky.frames.length) {
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', main.listPath, '-vf', `fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv444p`,
      '-c:v', 'ffv1', '-an', master])
    return master
  }
  const st = writeConcat(sticky, path.join(work, 'sticky'), { from: rec.t0, to: stickyEnd, cuts, speed: SPEED })
  const px = (v) => Math.round(v * scale)
  const sm = px(26)
  const sMask = path.join(work, 'smask.png'); makeMask(sMask, st.frameW, st.frameH, px(8))
  const sSh = path.join(work, 'sshadow.png'); makeShadow(sSh, st.frameW, st.frameH, sm, 165)
  const x = px(layout.sticky.x - layout.main.x), y = px(layout.sticky.y - layout.main.y)
  const appear = clipTime(sticky.frames[0].ts, rec.t0, cuts, SPEED).toFixed(3)
  const gone = clipTime(stickyEnd, rec.t0, cuts, SPEED).toFixed(3)
  const on = `enable='between(t,${appear},${gone})'`
  const fc = [
    '[0:v]fps=30,format=rgba[m]',
    `[1:v]fps=30,format=rgba[sv]`, '[2:v]format=gray[sk]', `[sv][sk]alphamerge,fade=t=in:st=${appear}:d=0.2:alpha=1[st]`,
    `[3:v]format=rgba,fade=t=in:st=${appear}:d=0.2:alpha=1[sh]`,
    `[m][sh]overlay=${x - sm}:${y - sm + px(10)}:${on}[b1]`,
    `[b1][st]overlay=${x}:${y}:eof_action=pass:${on}[b2]`,
    `[b2]scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv444p[out]`,
  ].join(';')
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', main.listPath, '-f', 'concat', '-safe', '0', '-i', st.listPath,
    '-loop', '1', '-framerate', '30', '-i', sMask, '-loop', '1', '-framerate', '30', '-i', sSh,
    '-filter_complex', fc, '-map', '[out]', '-t', main.duration.toFixed(3), '-c:v', 'ffv1', '-an', master])
  return master
}

// The loop: the last 0.5 s crossfade into the first frame, so the restart is seamless.
function encodeLoop(master, work) {
  const first = path.join(work, 'first.png')
  ffmpeg(['-i', master, '-frames:v', '1', first])
  const dur = probeDuration(master)
  const looped = path.join(work, 'looped.mkv')
  ffmpeg(['-i', master, '-loop', '1', '-framerate', '30', '-t', '0.6', '-i', first, '-filter_complex',
    `[0:v]settb=1/30[m];[1:v]format=yuv444p,fps=30,settb=1/30[f];[m][f]xfade=transition=fade:duration=0.5:offset=${(dur - 0.5).toFixed(3)},format=yuv444p[out]`,
    '-map', '[out]', '-c:v', 'ffv1', '-an', looped])
  return looped
}

function encodeVideos(looped, base) {
  ffmpeg(['-i', looped, '-vf', 'format=yuv420p', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '1', '-an', base + '.webm'])
  ffmpeg(['-i', looped, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '22', '-tune', 'animation',
    '-profile:v', 'high', '-movflags', '+faststart', '-an', base + '.mp4'])
}

// The poster is the first frame (no cursor yet), so poster → video → loop is seamless.
// 256-colour palette PNG (like the What's new posters): ~half the size of a truecolour one.
function encodePoster(master, at, file) {
  ffmpeg(['-ss', at.toFixed(3), '-i', master, '-frames:v', '1', '-vf',
    'split[a][b];[a]palettegen=max_colors=256:stats_mode=single[p];[b][p]paletteuse=dither=sierra2_4a',
    '-compression_level', '9', file])
}

// README GIF: hard-cut montage of [from, to] ranges (seconds in the master), own palette.
function encodeGif(master, ranges, file, { width = 760, fps = 12 } = {}) {
  const parts = ranges.map(([s, e], i) => `[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=PTS-STARTPTS[p${i}]`)
  const fc = [
    ...parts,
    `${ranges.map((_, i) => `[p${i}]`).join('')}concat=n=${ranges.length}:v=1:a=0,fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b]`,
    '[a]palettegen=max_colors=192:stats_mode=diff[p]',
    '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[out]',
  ].join(';')
  ffmpeg(['-i', master, '-filter_complex', fc, '-map', '[out]', '-loop', '0', file])
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function recordTheme(opts, themeKey, work) {
  const theme = THEMES[themeKey]
  const server = await startMockLlm(() => TEXT.answer)
  const ctx = await launchElectron({ appDir: opts.app, scale: opts.scale, size: SIZE, seed: seed(theme), tmpPrefix: 'nf-demo-' })
  let result
  try {
    // Real local semantic index (so the chat cites its sources) + the mock LLM.
    await ctx.page.evaluate((m) => window.noteflow.setAiSettings({ enabled: true, modelId: m }), MODEL)
    // A first query loads the model in the worker now (else a "Downloading model" toast shows up mid-take).
    await ctx.page.evaluate(() => window.noteflow.aiSearch('launch plan', 3))
    await configureMockLlm(ctx, server.address().port)
    await ctx.page.evaluate(() => localStorage.setItem('noteflow:brain-split-width', '38'))
    await reloadMain(ctx)
    // Warm the brain view once (graph + scene) so it opens at full speed during the take.
    await ctx.page.locator(`button[title="${TEXT.ui.openBrain}"]`).first().click()
    await ctx.page.locator('canvas').first().waitFor({ timeout: 10000 })
    await sleep(3000)
    await ctx.page.locator(`button[title="${TEXT.ui.closeBrain}"]`).first().click()
    // No focus ring left on the titlebar's brain button / pointer over it in the first frame.
    await ctx.page.evaluate(() => document.activeElement?.blur())
    await ctx.page.mouse.move(760, 470)
    await sleep(800)
    await injectOverlay(ctx.page, { ink: theme.ink })
    result = await take(ctx, theme)
  } finally {
    await closeApp(ctx)
    server.close()
  }
  const dir = path.join(work, themeKey)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const t = (name) => clipTime(result.marks[name], result.rec.t0, result.cuts, SPEED)
  const master = encodeMaster(result, dir, opts.scale)
  const looped = encodeLoop(master, dir)
  const base = path.join(opts.videoOut, theme.video)
  encodeVideos(looped, base)
  encodePoster(master, 0, path.join(opts.shotsOut, theme.poster))
  const out = [base + '.webm', base + '.mp4', path.join(opts.shotsOut, theme.poster)]
  if (opts.gif && theme.gif) {
    const gif = path.join(opts.shotsOut, theme.gif)
    // Section map → folded map + preview + group peek → sticky dropdown → the cited answer.
    encodeGif(master, [[t('tabs'), t('tabs') + 1.6], [t('map') + 0.2, t('peekEnd') - 0.4], [t('sticky'), t('stickyDone')], [t('asked') - 0.4, t('answered') + 1.2]], gif)
    out.push(gif)
  }
  if (opts.samples) sampleFrames(base + '.webm', opts.samples, 8)
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(path.join(opts.app, 'dist', 'index.html')) || !fs.existsSync(path.join(opts.app, 'dist-electron', 'main.js'))) {
    throw new Error(`${opts.app} has no built dist/ + dist-electron/ (run npm run build there)`)
  }
  for (const d of [opts.videoOut, opts.shotsOut]) fs.mkdirSync(d, { recursive: true })
  const work = opts.frames || fs.mkdtempSync(path.join(os.tmpdir(), 'nf-demo-frames-'))
  const themes = opts.theme === 'all' ? ['dark', 'light'] : [opts.theme]
  try {
    for (const key of themes) {
      console.log(`- ${key} …`)
      for (const file of await recordTheme(opts, key, work)) {
        const kb = (fs.statSync(file).size / 1024).toFixed(0)
        const dur = file.endsWith('.png') ? '' : `${probeDuration(file).toFixed(1)}s, `
        console.log(`  ${path.relative(REPO, file)}: ${dur}${kb} KB`)
      }
    }
  } finally {
    if (!opts.frames) fs.rmSync(work, { recursive: true, force: true })
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
