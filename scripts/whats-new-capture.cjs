// ─────────────────────────────────────────────────────────────────────────────
// whats-new-capture.cjs — records the looping clips of the "What's new" tour from
// the real app (Electron driven by Playwright) and encodes them with ffmpeg.
//
// Usage:
//   node scripts/whats-new-capture.cjs [--app <dir>] [--only id,id] [--lang en|es|all]
//                                      [--out <dir>] [--frames <dir>] [--scale <n>]
//
//   --app     app dir to launch (needs a built dist/ + dist-electron/). Default: repo root.
//             Tip: point it at a clean worktree of HEAD (npm run build there) so a dirty
//             tree or a parallel build never ends up in the clips.
//   --only    comma-separated clip ids (default: all). Ids: sections, kanban, links-palette,
//             quick-capture, windows, brain, ai, sync, section-map, floating-sidebar, snippets, more.
//   --lang    en | es | all (default: all).
//   --out     output dir (default: src/assets/whats-new). Writes <id>.<lang>.webm + .png poster.
//   --frames  keep the raw captured frames + sample PNGs here (debug); default: temp dir, deleted.
//   --scale   device scale factor used while recording (default 1.5 → crisp downscale to 960 px).
//
// Effects / safety:
//   - Every run uses a THROWAWAY Electron profile (--user-data-dir) and a throwaway notes dir
//     (NOTEFLOW_NOTES_DIR) under the OS temp dir, both deleted at the end. Demo notes are seeded
//     by writing v2 note folders directly — never through the NoteFlow CLI (NOTEFLOW_NOTES_DIR does
//     NOT isolate the CLI's NoteFlow Cloud session: it would push to the real account).
//   - No GitHub / Cloud connection is made. The AI clip talks to a local OpenAI-compatible mock
//     (127.0.0.1, random port) configured in the temp profile with a fake API key.
//   - Only the Electron processes launched here are closed; an installed NoteFlow keeps running.
//   - Windows open on screen while recording (occlusion detection is disabled so a covered window
//     still paints). Do not use the mouse/keyboard on them meanwhile.
//   - Capture = CDP Page.startScreencast (jpeg q92, every frame, timestamped) → ffmpeg concat with
//     the real frame durations → 30 fps CFR, scaled to 960×600 (16:10), VP9 (crf 32), no audio,
//     fade in/out so the loop restarts cleanly. Takes play back ~1.15–1.4× faster than real time.
//     A fake cursor and keystroke pills are injected into the page ONLY during the capture
//     (nothing in src/). "windows" records the main window and the sticky separately and composes
//     them over a desktop-like backdrop. "brain" dismisses the "Enable local AI" prompt as it
//     mounts (no embeddings in the temp profile; section links still draw the graph) and cuts the
//     hidden node-probing step out of the take. "more" is a montage with hard cuts.
//   Shared machinery (launch, overlay, actor, recorder, ffmpeg helpers) lives in lib/capture-kit.cjs
//   and the demo notebook in lib/demo-notes.cjs (also used by demo-capture.cjs).
//   Requires: playwright (devDependency) and ffmpeg in the PATH. The output is a set of real
//   screenshots of the UI: re-record after visible UI changes and review the clips by eye.
// ─────────────────────────────────────────────────────────────────────────────
const HELP_LINES = 41

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  sleep, startMockLlm, launchElectron, closeApp, injectOverlay, actor, startRecording, writeConcat, ffmpeg,
  probeDuration, sampleFrames, focusEditorEnd, focusLastTask, configureMockLlm, reloadMain,
  probeBrainNode, makeMask, makeShadow, clipTime,
} = require('./lib/capture-kit.cjs')
const { ID, demoContent, seedNotes } = require('./lib/demo-notes.cjs')

const REPO = path.resolve(__dirname, '..')
const CLIP_IDS = ['sections', 'kanban', 'links-palette', 'quick-capture', 'windows', 'brain', 'ai', 'sync',
  'section-map', 'floating-sidebar', 'snippets', 'more']
const OUT_W = 960
const OUT_H = 600 // every clip is 16:10 so the tour modal never jumps

// ── CLI args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { app: REPO, only: null, lang: 'all', out: path.join(REPO, 'src', 'assets', 'whats-new'), frames: null, scale: 1.5 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--app') o.app = path.resolve(next())
    else if (a === '--only') o.only = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--lang') o.lang = next()
    else if (a === '--out') o.out = path.resolve(next())
    else if (a === '--frames') o.frames = path.resolve(next())
    else if (a === '--scale') o.scale = Number(next())
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, HELP_LINES).join('\n')); process.exit(0) }
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (o.only) for (const id of o.only) if (!CLIP_IDS.includes(id)) throw new Error(`Unknown clip id: ${id}`)
  if (!['en', 'es', 'all'].includes(o.lang)) throw new Error('--lang must be en, es or all')
  return o
}

const WHATS_NEW_SEEN = [...CLIP_IDS]

function seedProfile(profileDir, lang, extra = {}) {
  const settings = {
    language: lang,
    whatsNewSeen: WHATS_NEW_SEEN,
    openAtLogin: false,
    uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'pinned', ...(extra.uiState || {}) },
    ...extra.settings,
  }
  fs.writeFileSync(path.join(profileDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

async function launchApp(opts, lang, { settings = {}, uiState = {}, extraSections = {}, files = {}, size = { width: 960, height: 600 } } = {}) {
  const ctx = await launchElectron({
    appDir: opts.app, scale: opts.scale, size, tmpPrefix: 'nf-whatsnew-',
    seed: ({ notes, profile }) => {
      seedNotes(notes, lang, extraSections)
      for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(notes, name), content)
      seedProfile(profile, lang, { settings, uiState })
    },
  })
  return { ...ctx, lang }
}

// crop: CSS-px rect in the window ({x,y,w,h}); it is grown to 16:10 around its center.
function cropFilter(crop, cssW, cssH, pxW, pxH) {
  const k = pxW / cssW
  let { x, y, w, h } = crop || { x: 0, y: 0, w: cssW, h: cssH }
  const target = OUT_W / OUT_H
  if (w / h > target) { const nh = w / target; y -= (nh - h) / 2; h = nh } else { const nw = h * target; x -= (nw - w) / 2; w = nw }
  x = Math.max(0, Math.min(cssW - w, x)); y = Math.max(0, Math.min(cssH - h, y))
  w = Math.min(w, cssW); h = Math.min(h, cssH)
  const r = (v) => Math.floor((v * k) / 2) * 2
  const cw = Math.min(r(w), pxW - (pxW % 2)), ch = Math.min(r(h), pxH - (pxH % 2))
  return `crop=${cw}:${ch}:${Math.min(r(x), pxW - cw)}:${Math.min(r(y), pxH - ch)},scale=${OUT_W}:${OUT_H}:flags=lanczos`
}

// Encodes a concat list (or a ready filter graph input) into the final webm + poster.
function encodeClip({ listPath, frameW, frameH }, crop, outBase, { posterAt, fadeIn = 0.25, fadeOut = 0.45, cssW, cssH } = {}) {
  const tmp = outBase + '.tmp.mkv'
  const vf = [cropFilter(crop, cssW, cssH, frameW, frameH), 'fps=30', 'format=yuv420p'].join(',')
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-vf', vf, '-c:v', 'ffv1', '-an', tmp])
  finishClip(tmp, outBase, { posterAt, fadeIn, fadeOut })
}

function finishClip(srcLossless, outBase, { posterAt, fadeIn = 0.25, fadeOut = 0.45 } = {}) {
  const dur = probeDuration(srcLossless)
  const fades = [fadeIn ? `fade=t=in:st=0:d=${fadeIn}` : null, fadeOut ? `fade=t=out:st=${(dur - fadeOut).toFixed(3)}:d=${fadeOut}` : null].filter(Boolean).join(',') || 'null'
  ffmpeg(['-i', srcLossless, '-vf', `${fades},format=yuv420p`, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '1', '-pix_fmt', 'yuv420p', '-an', outBase + '.webm'])
  // Default poster: the settled end state, just before the fade-out starts.
  const at = posterAt != null ? Math.min(posterAt, dur - 0.1) : Math.max(0, dur - fadeOut - 0.08)
  // 256-colour palette PNG: ~half the size of a truecolour one, indistinguishable at poster use.
  ffmpeg(['-ss', at.toFixed(3), '-i', srcLossless, '-frames:v', '1', '-vf',
    'split[a][b];[a]palettegen=max_colors=256:stats_mode=single[p];[b][p]paletteuse=dither=sierra2_4a',
    '-compression_level', '9', outBase + '.png'])
  fs.rmSync(srcLossless, { force: true })
}

// ── Per-language strings: demo text typed in the takes + UI labels used as selectors ──
const TEXT = {
  en: {
    newSection: 'Checklist', secItems: ['Book the venue', 'Send invites'],
    sprint: '## Sprint 14\n\nGoal: ship **wave 1** to the design partners.',
    cards: ['Record the demo video', 'Write the release notes'],
    syncWith: 'Sync with ', linkQuery: 'endp', paletteQuery: 'lisb',
    quick: 'Call Ana about the demo — Thursday 4pm',
    stickyLine: 'Book the photographer',
    hiringExtra: [['Offers', '- Ana — offer sent, answer by Friday'], ['Onboarding', '- [ ] Laptop + accounts\n- [ ] First-week buddy']],
    snippets: [
      { name: 'Journal entry', content: '## {date:dddd, MMMM D}\n\n' },
      { name: 'Meeting', content: '## Meeting — {date:DD-MM-YYYY}\n\n**Attendees:** \n\n- [ ] ' },
      { name: 'Signature', content: '— Alex, {date:DD-MM-YYYY}' },
    ],
    journalLine: 'Long run by the river, then wrote the launch FAQ.',
    template: { name: 'Weekly 1:1', sections: [['Agenda', '- Wins since last week\n- Blockers\n- Career'], ['Notes', ''], ['Action items', '- [ ] ']] },
    question: 'Summarize the launch plan',
    answer: 'The **Q4 launch** ships in three waves, two weeks apart:\n\n1. **Wave 1** — private beta with 50 design partners\n2. **Wave 2** — waitlist + pricing page go live\n3. **Wave 3** — public launch with the press kit\n\nLock down the API *Endpoints* and the design-system *Components* first.',
    ui: {
      openBrain: 'Open brain view', openChat: 'Open AI chat', settings: 'Settings', sync: 'Sync', github: 'GitHub Sync', cloud: 'NoteFlow Cloud',
      enableAi: 'Enable local AI', cancel: 'Cancel', addCard: 'Add card', done: 'Done', expiry: 'Change when this note is deleted',
      hours8: 'Delete in 8 hours from now', connectGh: 'Connect with GitHub',
      sectionOptions: 'Section options', encrypt: 'Encrypt note', templates: 'Templates', newNote: 'New note', appearance: 'Appearance',
      sidebarSections: 'Sections in the sidebar', sectionsMap: 'Folded map', sectionsRow: 'Scroll row',
      insertSnippet: 'Insert snippet: ', chooseSnippet: 'Choose a snippet',
    },
  },
  es: {
    newSection: 'Pendientes', secItems: ['Reservar sala', 'Enviar invitaciones'],
    sprint: '## Sprint 14\n\nObjetivo: entregar la **oleada 1** a los clientes piloto.',
    cards: ['Grabar el vídeo de demo', 'Escribir las notas de versión'],
    syncWith: 'Coordinar con ', linkQuery: 'endp', paletteQuery: 'lisb',
    quick: 'Llamar a Ana por la demo — jueves 16:00',
    stickyLine: 'Reservar el fotógrafo',
    hiringExtra: [['Ofertas', '- Ana — oferta enviada, responde el viernes'], ['Onboarding', '- [ ] Portátil + cuentas\n- [ ] Compañero de la primera semana']],
    snippets: [
      { name: 'Entrada de diario', content: '## {date:dddd, D [de] MMMM}\n\n' },
      { name: 'Reunión', content: '## Reunión — {date:DD-MM-YYYY}\n\n**Asistentes:** \n\n- [ ] ' },
      { name: 'Firma', content: '— Alex, {date:DD-MM-YYYY}' },
    ],
    journalLine: 'Carrera larga junto al río y después la FAQ del lanzamiento.',
    template: { name: '1:1 semanal', sections: [['Agenda', '- Logros desde la última semana\n- Bloqueos\n- Carrera'], ['Notas', ''], ['Acciones', '- [ ] ']] },
    question: 'Resume el plan de lanzamiento',
    answer: 'El **lanzamiento del Q4** sale en tres oleadas, cada dos semanas:\n\n1. **Oleada 1** — beta privada con 50 clientes piloto\n2. **Oleada 2** — lista de espera + página de precios\n3. **Oleada 3** — lanzamiento público con kit de prensa\n\nCierra primero los *Endpoints* de la API y los *Componentes* del sistema de diseño.',
    ui: {
      openBrain: 'Abrir la vista cerebro', openChat: 'Abrir el chat con IA', settings: 'Ajustes', sync: 'Sincronización', github: 'GitHub Sync', cloud: 'NoteFlow Cloud',
      enableAi: 'Activar la IA local', cancel: 'Cancelar', addCard: 'Añadir tarjeta', done: 'Hecho', expiry: 'Cambiar cuándo se elimina esta nota',
      hours8: 'Eliminar dentro de 8 horas', connectGh: 'Conectar con GitHub',
      sectionOptions: 'Opciones de sección', encrypt: 'Cifrar nota', templates: 'Plantillas', newNote: 'Nueva nota', appearance: 'Apariencia',
      sidebarSections: 'Secciones en la barra lateral', sectionsMap: 'Mapa plegado', sectionsRow: 'Fila con scroll',
      insertSnippet: 'Insertar fragmento: ', chooseSnippet: 'Elegir un fragmento',
    },
  },
}

// Takes are played back a bit faster than real time: snappier loops, typing still looks human.
const DEFAULT_SPEED = 1.15

// Each clip: { launch: launchApp options (or T => options), run(ctx, actor, T) → { rec, cuts?, posterAt? } }
const CLIPS = {
  // Ctrl+T → name the tab → write → Ctrl+Tab through the sections.
  sections: {
    launch: { size: { width: 800, height: 500 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'floating' } },
    async run({ page }, a, T) {
      await a.show(560, 330)
      const rec = await startRecording(page)
      await sleep(250)
      await a.keys('Control+T')
      await sleep(420)
      await a.type(T.newSection, { min: 35, max: 75 })
      await sleep(180)
      await a.press('Enter')
      await sleep(250)
      await page.keyboard.type('- ')
      await a.type(T.secItems[0], { min: 25, max: 55 })
      await page.keyboard.press('Enter')
      await a.type(T.secItems[1], { min: 25, max: 55 })
      await sleep(350)
      const posterTs = Date.now() / 1000
      await sleep(300)
      for (let i = 0; i < 2; i++) { await a.keys('Control+Tab', null, 650); await sleep(700) }
      await sleep(250)
      return { rec: await rec.stop(), posterTs }
    },
  },

  // /kanban → board → two cards → drag one to Done.
  kanban: {
    speed: 1.35,
    launch: (T) => ({
      size: { width: 900, height: 563 },
      uiState: { activeNoteId: ID.launch, activeSectionId: 'ssprnt', sidebarMode: 'floating' },
      extraSections: { [ID.launch]: [{ id: 'ssprnt', name: 'Sprint', content: T.sprint }] },
    }),
    async run({ page }, a, T) {
      await focusEditorEnd(page)
      await page.keyboard.press('Enter')
      await a.show(560, 380)
      const rec = await startRecording(page)
      await sleep(250)
      await a.type('/kanban', { min: 50, max: 85 })
      await sleep(380)
      await a.press('Enter', '↵')
      await sleep(550)
      await a.click(page.getByText(T.ui.addCard, { exact: true }).first(), { after: 150 })
      await a.type(T.cards[0], { min: 22, max: 48 })
      await page.keyboard.press('Enter')
      await sleep(150)
      await page.keyboard.press('Escape')
      await sleep(300)
      const card = page.getByText(T.cards[0], { exact: true }).first()
      const hb = await page.getByText(T.ui.done, { exact: true }).first().boundingBox()
      await a.drag(card, hb.x + 60, hb.y + 40, { ms: 1000 })
      await sleep(350)
      await a.move(hb.x - 220, hb.y + 190, 600)
      await sleep(750)
      return { rec: await rec.stop() }
    },
  },

  // "/" → Link section → pick → pill; then Ctrl+P → jump to another note.
  'links-palette': {
    launch: { size: { width: 800, height: 500 }, uiState: { activeNoteId: ID.review, activeSectionId: 'snextw', sidebarMode: 'floating' } },
    async run({ page }, a, T) {
      await focusEditorEnd(page)
      await page.keyboard.press('Enter')
      await a.show(520, 330)
      const rec = await startRecording(page)
      await sleep(350)
      await a.type(T.syncWith, { min: 30, max: 70 })
      await page.keyboard.type('/')
      await sleep(550)
      await a.press('Enter', '↵')
      await sleep(500)
      await a.type(T.linkQuery, { min: 80, max: 120 })
      await sleep(450)
      await a.press('Enter', '↵')
      await sleep(650)
      const posterTs = Date.now() / 1000
      await sleep(350)
      await a.keys('Control+P')
      await sleep(500)
      await a.type(T.paletteQuery, { min: 80, max: 120 })
      await sleep(550)
      await a.press('Enter', '↵')
      await sleep(1100)
      return { rec: await rec.stop(), posterTs }
    },
  },

  // Ctrl+Shift+N → temporary note → a quick line → change when it is deleted.
  'quick-capture': {
    launch: { size: { width: 800, height: 500 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'floating' } },
    async run({ page }, a, T) {
      await a.show(600, 420)
      const rec = await startRecording(page)
      await sleep(250)
      await a.keys('Control+Shift+N')
      await sleep(550)
      // The new note's editor autofocuses as it mounts; make sure the caret is in the body
      // (not the title) before typing, whatever the mount timing was.
      await page.waitForFunction(() => {
        const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
        return el && el.editor.isEmpty
      }, null, { timeout: 5000 })
      await focusEditorEnd(page)
      await a.type(T.quick, { min: 22, max: 48 })
      await sleep(250)
      await a.click(page.locator(`button[aria-label="${T.ui.expiry}"]`).first())
      await sleep(400)
      await a.click(page.locator(`button[aria-label="${T.ui.hours8}"]`).first(), { after: 300 })
      await a.move(560, 330, 500)
      await sleep(750)
      return { rec: await rec.stop() }
    },
  },

  // Ctrl+S pops the section out as a floating sticky; typing there updates the main window.
  windows: {
    launch: { size: { width: 800, height: 500 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'stasks', sidebarMode: 'floating' } },
    composite: true,
    async run(ctx, a, T) {
      const { page, app } = ctx
      await a.show(600, 330)
      const rec = await startRecording(page)
      await sleep(500)
      await a.move(520, 300)
      const winP = app.waitForEvent('window')
      await a.keys('Control+S')
      const sticky = await winP
      await sticky.waitForLoadState('domcontentloaded')
      await sticky.waitForSelector('.ProseMirror')
      await injectOverlay(sticky)
      const srec = await startRecording(sticky)
      const sb = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('#sticky'))
        return w.getContentBounds()
      })
      const layout = windowsLayout(ctx.size, sb)
      await sleep(600)
      // Hand the cursor over to the sticky at the same on-canvas spot.
      const target = { x: 255, y: 215 }
      const viaMain = { x: target.x + layout.sticky.x - layout.main.x, y: target.y + layout.sticky.y - layout.main.y }
      await a.move(viaMain.x, viaMain.y, 700)
      await a.hide()
      const s = actor(sticky)
      await s.show(target.x, target.y)
      await focusLastTask(sticky)
      await sticky.keyboard.press('Enter')
      await s.type(T.stickyLine, { min: 35, max: 75 })
      await sleep(1300)
      const mainRec = await rec.stop()
      const stickyRec = await srec.stop()
      return { rec: mainRec, sticky: stickyRec, layout }
    },
  },

  // Brain view: open it, orbit, hover a note so its links light up, click → preview.
  brain: {
    speed: 1.2,
    launch: { size: { width: 1040, height: 650 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'floating' } },
    llm: true,
    async run(ctx, a, T) {
      const { page } = ctx
      await page.evaluate(() => localStorage.setItem('noteflow:brain-split-width', '34'))
      await reloadMain(ctx)
      await injectOverlay(page)
      // The "Enable local AI" prompt (no embeddings in this throwaway profile) is dismissed
      // the instant it mounts — the clip shows the brain as it looks once AI is set up.
      await page.evaluate(([title, cancel]) => {
        const mo = new MutationObserver(() => {
          for (const h of document.querySelectorAll('h2')) {
            if (h.textContent.trim() !== title) continue
            const btn = [...h.closest('div.rounded-lg').querySelectorAll('button')].find((b) => b.textContent.trim() === cancel)
            if (btn) btn.click()
          }
        })
        mo.observe(document.body, { childList: true, subtree: true })
      }, [T.ui.enableAi, T.ui.cancel])
      await a.show(560, 320)
      const rec = await startRecording(page)
      await sleep(250)
      await a.click(page.locator(`button[title="${T.ui.openBrain}"]`).first(), { after: 1100 })
      const cb = await page.evaluate(() => {
        const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width - x.width)[0]
        const r = c.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })
      const cx = cb.x + cb.w * 0.5, cy = cb.y + cb.h * 0.45
      await a.move(cx + 40, cy + 30, 450)
      await page.mouse.wheel(0, -260)
      await sleep(450)
      await a.dragFrom(cx + 40, cy + 30, cx + 170, cy + 60, { ms: 900, after: 150 })
      // Hidden step (cut from the clip): find a note node under the pointer.
      const cutStart = Date.now() / 1000
      const hit = await probeBrainNode(page, cb)
      await page.mouse.move(cx + 170, cy + 60)
      await sleep(350)
      const cutEnd = Date.now() / 1000
      if (hit) {
        await a.move(hit.x, hit.y, 650)
        await sleep(750)
        await a.clickAt(hit.x, hit.y, { ms: 120, after: 1400 })
      } else {
        await sleep(1500)
      }
      return { rec: await rec.stop(), cuts: [[cutStart, cutEnd]] }
    },
  },

  // Chat sidebar in the editor, answered by the local mock (streaming).
  ai: {
    speed: 1.3,
    launch: { size: { width: 960, height: 600 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'floating' } },
    llm: true,
    async run(ctx, a, T) {
      const { page } = ctx
      await reloadMain(ctx)
      await injectOverlay(page)
      await a.show(560, 360)
      const rec = await startRecording(page)
      await sleep(400)
      await a.click(page.locator(`button[aria-label="${T.ui.openChat}"], button[title="${T.ui.openChat}"]`).first(), { after: 450 })
      await a.click(page.locator('textarea').last(), { after: 120 })
      await a.type(T.question, { min: 22, max: 48 })
      await sleep(180)
      await a.press('Enter', '↵')
      // Wait for the streamed answer to reach its last line, then hold on it.
      const tail = T.answer.replace(/[*_`#]/g, '').slice(-14)
      await page.waitForFunction((tail) => document.body.innerText.includes(tail), tail, { timeout: 20000 }).catch(() => {})
      await sleep(700)
      await a.move(430, 420, 700)
      await sleep(900)
      return { rec: await rec.stop() }
    },
  },

  // Montage, hard cuts between shots: encrypt a note · new note from a template · themes.
  more: {
    speed: 1.4,
    launch: (T) => ({
      size: { width: 800, height: 500 },
      uiState: { activeNoteId: ID.ideas, activeSectionId: 'sinbox', sidebarMode: 'floating' },
      files: {
        'templates.json': JSON.stringify([{
          id: 'tpl1on1x', name: T.template.name, title: T.template.name, createdAt: new Date().toISOString(),
          sections: T.template.sections.map(([name, content], i) => ({ id: `tpls0${i}`, name, content, isRawMode: false })),
        }], null, 2),
      },
    }),
    async run({ page }, a, T) {
      const now = () => Date.now() / 1000
      const cuts = []
      await a.show(520, 300)
      const rec = await startRecording(page)
      await sleep(200)
      // 1 · Encrypt the open note.
      // The note's ⋯ menu (the section map's chevrons share the title, so skip them).
      await a.click(page.locator(`button[title="${T.ui.sectionOptions}"]:not(.section-map-chevron)`).first(), { after: 300 })
      await a.click(page.getByText(T.ui.encrypt, { exact: true }).first(), { after: 300 })
      const pw = page.locator('input[type="password"]')
      await a.click(pw.nth(0), { after: 80, fx: 0.8 })
      await a.type('hunter2!', { min: 25, max: 45 })
      await page.keyboard.press('Tab')
      await a.type('hunter2!', { min: 18, max: 35 })
      await sleep(150)
      await a.press('Enter', '↵')
      await sleep(1100)
      // 2 · New note from a template (opening Settings → Templates is cut).
      let c0 = now()
      await page.locator(`button[title="${T.ui.settings}"]`).first().click()
      await page.getByText(T.ui.templates, { exact: true }).first().click()
      await sleep(450)
      const newBtn = page.getByText(T.ui.newNote, { exact: true }).first()
      const nb = await newBtn.boundingBox()
      await a.show(nb.x - 60, nb.y + 70)
      await sleep(80)
      cuts.push([c0, now()])
      await sleep(250)
      await a.click(newBtn, { after: 1100 })
      // 3 · Themes, live (opening Settings → Appearance is cut).
      c0 = now()
      await page.locator(`button[title="${T.ui.settings}"]`).first().click()
      await page.getByText(T.ui.appearance, { exact: true }).first().click()
      await sleep(450)
      const theme = (name) => page.locator('button', { hasText: name }).first()
      const tb = await theme('Midnight Blue').boundingBox()
      await a.show(tb.x + tb.width / 2 - 40, tb.y + tb.height + 60)
      await sleep(80)
      cuts.push([c0, now()])
      await sleep(250)
      await a.click(theme('Midnight Blue'), { after: 400 })
      const posterTs = Date.now() / 1000
      await sleep(300)
      await a.click(theme('Arctic Day'), { after: 500 })
      await a.click(theme('NoteFlow Light'), { after: 500 })
      await a.click(theme('NoteFlow Dark'), { after: 650 })
      return { rec: await rec.stop(), cuts, posterTs }
    },
  },

  // Settings → Sync: the two backends, nothing connected.
  sync: {
    speed: 1.25,
    launch: { size: { width: 880, height: 550 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'floating' } },
    async run({ page }, a, T) {
      await a.show(560, 330)
      const rec = await startRecording(page)
      await sleep(200)
      await a.click(page.locator(`button[title="${T.ui.settings}"]`).first(), { after: 350 })
      await a.click(page.getByText(T.ui.sync, { exact: true }).first(), { after: 900 })
      await a.click(page.getByText(T.ui.github, { exact: true }).first(), { after: 650 })
      await a.moveTo(page.getByText(T.ui.connectGh, { exact: true }).first())
      await sleep(700)
      await a.click(page.getByText(T.ui.cloud, { exact: true }).first(), { after: 450 })
      await a.move(845, 120, 500)
      await sleep(750)
      return { rec: await rec.stop() }
    },
  },

  // Rest on the folded line under a note → its section map unfolds → click a cell → the note
  // opens there (its map stays open in the row); then Settings → Appearance, the two styles.
  'section-map': {
    speed: 1.2,
    launch: (T) => ({
      size: { width: 900, height: 563 },
      // Product folder collapsed: a tidier list (Product launch still shows in Favorites).
      uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'pinned', collapsedFolderIds: [ID.fProduct] },
      // Hiring (near the top of the list) with four sections: a map worth unfolding.
      extraSections: { [ID.hiring]: T.hiringExtra.map(([name, content], i) => ({ id: `shirx${i}`, name, content })) },
    }),
    async run({ page, lang }, a, T) {
      const now = () => Date.now() / 1000
      const { S } = demoContent(lang)
      await a.show(620, 330)
      const rec = await startRecording(page)
      await sleep(350)
      const p = await a.moveTo(page.locator(`button[data-note-id="${ID.hiring}"] .nsm-line`).first(), { fx: 0.35 })
      await page.locator('.nsm-peek .nsm-cell').first().waitFor({ timeout: 3000 })
      await sleep(800)
      // Browse the unfolded cells a little before picking one.
      await a.move(p.x + 40, p.y, 350)
      await sleep(300)
      await a.click(page.locator('.nsm-peek .nsm-cell', { hasText: S.loop }).first(), { after: 900 })
      await a.move(620, 300, 700)
      await sleep(500)
      const posterTs = now()
      await sleep(400)
      // Settings → Appearance → "Sections in the sidebar" (opening it is cut).
      const c0 = now()
      await page.locator(`button[title="${T.ui.settings}"]`).first().click()
      await page.getByText(T.ui.appearance, { exact: true }).first().click()
      await sleep(300)
      await page.getByText(T.ui.sidebarSections, { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await sleep(350)
      const row = page.locator('button', { hasText: T.ui.sectionsRow }).first()
      const rb = await row.boundingBox()
      await a.show(rb.x + rb.width / 2, rb.y + rb.height + 70)
      await sleep(80)
      const cuts = [[c0, now()]]
      await sleep(250)
      await a.moveTo(row, { ms: 600 })
      await sleep(700)
      await a.moveTo(page.locator('button', { hasText: T.ui.sectionsMap }).first(), { ms: 600 })
      await sleep(900)
      return { rec: await rec.stop(), cuts, posterTs }
    },
  },

  // Ctrl+' folds the sidebar into the minimap → the left edge brings it back as a panel →
  // resting on a collapsed group peeks at its notes.
  'floating-sidebar': {
    speed: 1.2,
    launch: { size: { width: 900, height: 563 }, uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'pinned', collapsedGroupIds: [ID.gWork, ID.gLearn] } },
    async run({ app, page, size, lang }, a) {
      const work = demoContent(lang).groups.find((g) => g.id === ID.gWork).name
      // The group peek only opens in a focused window.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
      await focusEditorEnd(page)
      await a.show(600, 300)
      const rec = await startRecording(page)
      await sleep(500)
      await a.keys("Control+'", null, 1100)
      await sleep(1300)
      // Left edge → the floating panel slides in.
      await a.move(11, size.height * 0.45, 800)
      await sleep(900)
      const header = page.locator('.sbg-ghb').filter({ has: page.locator('.sbg-gname', { hasText: work }) }).first()
      await a.moveTo(header, { fx: 0.72, ms: 700 })
      await page.locator('[data-peek-index]').first().waitFor({ timeout: 3000 })
      await sleep(900)
      // On the title, not on the row's section line (that would unfold its map over the list).
      await a.moveTo(page.locator('[data-peek-index="1"]').first(), { fx: 0.55, fy: 0.25, ms: 650 })
      await sleep(1300)
      return { rec: await rec.stop() }
    },
  },

  // The stamp button drops the default snippet (today's date) at the caret; its arrow lists the rest.
  snippets: {
    speed: 1.25,
    launch: (T) => ({
      size: { width: 800, height: 500 },
      uiState: { activeNoteId: ID.habits, activeSectionId: 'shabit', sidebarMode: 'floating' },
      files: {
        'snippets.json': JSON.stringify(T.snippets.map((sn, i) => ({
          id: `snipdem${i}`, name: sn.name, content: sn.content, createdAt: new Date().toISOString(), ...(i === 0 ? { isDefault: true } : {}),
        })), null, 2),
      },
    }),
    async run({ page }, a, T) {
      // Caret on a fresh paragraph below the task list.
      await focusLastTask(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Enter')
      await a.show(520, 330)
      const rec = await startRecording(page)
      await sleep(350)
      await a.click(page.locator(`button[aria-label^="${T.ui.insertSnippet}"]`).first(), { after: 450 })
      await a.type(T.journalLine, { min: 22, max: 48 })
      await sleep(450)
      await a.click(page.locator(`button[aria-label="${T.ui.chooseSnippet}"]`).first(), { after: 450 })
      await a.moveTo(page.locator('[role="menu"] [role="menuitem"]').nth(1), { fx: 0.35, ms: 600 })
      await sleep(1300)
      return { rec: await rec.stop() }
    },
  },
}

// Where the main window and the sticky sit on the composed "desktop" (CSS px).
function windowsLayout(size, sticky) {
  const main = { x: 0, y: 0, w: size.width, h: size.height }
  const st = { x: size.width - 205, y: size.height - 265, w: sticky.width, h: sticky.height }
  const pad = 34
  let minX = Math.min(main.x, st.x) - pad, minY = Math.min(main.y, st.y) - pad
  let w = Math.max(main.x + main.w, st.x + st.w) + pad - minX
  let h = Math.max(main.y + main.h, st.y + st.h) + pad - minY
  const target = OUT_W / OUT_H
  if (w / h > target) { const nh = w / target; minY -= (nh - h) / 2; h = nh } else { const nw = h * target; minX -= (nw - w) / 2; w = nw }
  const off = (r) => ({ ...r, x: r.x - minX, y: r.y - minY })
  return { canvas: { w, h }, main: off(main), sticky: off(st) }
}

function makeBackdrop(file, w, h) {
  // Soft "desktop": deep indigo → slate diagonal with a faint warm glow top-left.
  const g = (a, b) => `(${a})*(1-(X/W+Y/H)/2)+(${b})*((X/W+Y/H)/2)`
  const glow = `exp(-(pow(X-W*0.22\\,2)+pow(Y-H*0.18\\,2))/(2*pow(W*0.33\\,2)))`
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}`, '-frames:v', '1', '-vf',
    `format=gbrp,geq=r='${g(38, 16)}+46*${glow}':g='${g(32, 20)}+26*${glow}':b='${g(74, 38)}+30*${glow}'`, file])
}

// Composes the main window + the sticky (each recorded on its own, real timings) over a backdrop.
function encodeWindows(result, work, outBase, scale) {
  const { rec, sticky, layout } = result
  const speed = result.speed || 1
  const mainList = writeConcat(rec, path.join(work, 'main'), { speed })
  const stickyList = writeConcat(sticky, path.join(work, 'sticky'), { from: rec.t0, to: rec.t1, speed })
  const px = (v) => Math.round((v * scale) / 2) * 2
  const CW = px(layout.canvas.w), CH = px(layout.canvas.h)
  const M = layout.main, S = layout.sticky
  const mw = mainList.frameW, mh = mainList.frameH, sw = stickyList.frameW, sh = stickyList.frameH
  const sm = px(28)
  const bg = path.join(work, 'bg.png'); makeBackdrop(bg, CW, CH)
  const mMask = path.join(work, 'mmask.png'); makeMask(mMask, mw, mh, px(9))
  const sMask = path.join(work, 'smask.png'); makeMask(sMask, sw, sh, px(9))
  const mSh = path.join(work, 'mshadow.png'); makeShadow(mSh, mw, mh, sm, 150)
  const sSh = path.join(work, 'sshadow.png'); makeShadow(sSh, sw, sh, sm, 170)
  const appear = (Math.max(0, sticky.frames[0].ts - rec.t0) / speed).toFixed(3)
  const fc = [
    '[1:v]fps=30,format=rgba[mv]', '[2:v]format=gray[mm]', '[mv][mm]alphamerge[main]',
    '[3:v]fps=30,format=rgba[sv]', '[4:v]format=gray[smk]', `[sv][smk]alphamerge,fade=t=in:st=${appear}:d=0.22:alpha=1[st]`,
    `[6:v]format=rgba,fade=t=in:st=${appear}:d=0.22:alpha=1[ssh]`,
    `[0:v][5:v]overlay=${px(M.x) - sm}:${px(M.y) - sm + px(10)}[b1]`,
    `[b1][main]overlay=${px(M.x)}:${px(M.y)}:shortest=1[b2]`,
    `[b2][ssh]overlay=${px(S.x) - sm}:${px(S.y) - sm + px(12)}[b3]`,
    `[b3][st]overlay=${px(S.x)}:${px(S.y)}[b4]`,
    `[b4]scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p[out]`,
  ].join(';')
  const tmp = outBase + '.tmp.mkv'
  ffmpeg(['-loop', '1', '-framerate', '30', '-i', bg,
    '-f', 'concat', '-safe', '0', '-i', mainList.listPath, '-loop', '1', '-framerate', '30', '-i', mMask,
    '-f', 'concat', '-safe', '0', '-i', stickyList.listPath, '-loop', '1', '-framerate', '30', '-i', sMask,
    '-loop', '1', '-framerate', '30', '-i', mSh, '-loop', '1', '-framerate', '30', '-i', sSh,
    '-filter_complex', fc, '-map', '[out]', '-t', mainList.duration.toFixed(3), '-c:v', 'ffv1', '-an', tmp])
  return tmp
}

// ── Runner ──────────────────────────────────────────────────────────────────
async function recordClip(opts, id, lang, work) {
  const clip = CLIPS[id]
  const T = TEXT[lang]
  const launchOpts = typeof clip.launch === 'function' ? clip.launch(T) : clip.launch
  const server = clip.llm ? await startMockLlm(() => T.answer) : null
  const ctx = await launchApp(opts, lang, launchOpts)
  let result
  try {
    if (server) await configureMockLlm(ctx, server.address().port)
    await injectOverlay(ctx.page)
    result = await clip.run(ctx, actor(ctx.page), T)
  } finally {
    await closeApp(ctx)
    if (server) server.close()
  }
  const outBase = path.join(opts.out, `${id}.${lang}`)
  const clipWork = path.join(work, `${id}.${lang}`)
  fs.rmSync(clipWork, { recursive: true, force: true })
  const speed = clip.speed ?? DEFAULT_SPEED
  // A clip may pin its poster to a wall-clock moment of the take (posterTs).
  if (result.posterTs) result.posterAt = clipTime(result.posterTs, result.rec.t0, result.cuts || [], speed)
  try {
    if (clip.composite) {
      const tmp = encodeWindows({ ...result, speed }, clipWork, outBase, opts.scale)
      finishClip(tmp, outBase, { posterAt: result.posterAt })
    } else {
      const list = writeConcat(result.rec, clipWork, { cuts: result.cuts || [], speed })
      encodeClip(list, result.crop || null, outBase, { posterAt: result.posterAt, cssW: ctx.size.width, cssH: ctx.size.height })
    }
  } finally {
    fs.rmSync(outBase + '.tmp.mkv', { force: true })
  }
  return outBase
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const ids = opts.only || CLIP_IDS.filter((id) => CLIPS[id])
  const langs = opts.lang === 'all' ? ['en', 'es'] : [opts.lang]
  for (const id of ids) if (!CLIPS[id]) throw new Error(`Clip "${id}" is not implemented`)
  if (!fs.existsSync(path.join(opts.app, 'dist', 'index.html')) || !fs.existsSync(path.join(opts.app, 'dist-electron', 'main.js'))) {
    throw new Error(`${opts.app} has no built dist/ + dist-electron/ (run npm run build there)`)
  }
  fs.mkdirSync(opts.out, { recursive: true })
  const work = opts.frames || fs.mkdtempSync(path.join(os.tmpdir(), 'nf-whatsnew-frames-'))
  const failed = []
  for (const lang of langs) {
    for (const id of ids) {
      process.stdout.write(`- ${id}.${lang} ... `)
      try {
        const base = await recordClip(opts, id, lang, work)
        const kb = (fs.statSync(base + '.webm').size / 1024).toFixed(0)
        console.log(`${probeDuration(base + '.webm').toFixed(1)}s, ${kb} KB`)
        if (opts.frames) sampleFrames(base + '.webm', path.join(opts.frames, 'samples'))
      } catch (err) {
        failed.push(`${id}.${lang}`)
        console.log('FAILED')
        console.error(err)
      }
    }
  }
  if (!opts.frames) fs.rmSync(work, { recursive: true, force: true })
  if (failed.length) { console.error(`Failed: ${failed.join(', ')}`); process.exit(1) }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1) })
}

module.exports = { parseArgs, demoContent, seedNotes, launchApp, closeApp, injectOverlay, actor, startRecording, writeConcat, CLIPS, TEXT, ID }
