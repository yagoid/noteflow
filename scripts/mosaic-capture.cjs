// ─────────────────────────────────────────────────────────────────────────────
// mosaic-capture.cjs — records the short feature clips of the landing mosaic (also used by the
// marketing team in social posts) from the real app, driven by fixed scripts over the demo
// notebook. Machinery: lib/capture-kit.cjs; notebook: lib/demo-notes.cjs.
//
// Usage:
//   node scripts/mosaic-capture.cjs [--app <dir>] [--only id,id] [--theme dark|light|all]
//                                   [--out <dir>] [--marketing <dir>] [--samples <dir>] [--frames <dir>]
//
//   --app        app dir to launch (needs a built dist/ + dist-electron/). Default: repo root.
//                Tip: a clean worktree of HEAD (npm run build there), not a half-edited tree.
//   --only       comma-separated clip ids (default: all, see MANIFEST below).
//   --theme      dark (NoteFlow Dark) | light (NoteFlow Light) | all (default). `themes` has a
//                single variant and is recorded whatever this says.
//   --out        web outputs (default docs/public/mosaic): <id>-<dark|light>.{webm,mp4,webp}
//                (themes: themes.{webm,mp4,webp}); the webp poster = the first frame.
//   --marketing  also write the high-quality masters here (<id>-<variant>.mp4 / themes.mp4).
//   --samples    write 5 sample PNGs per clip here (visual review).
//   --frames     keep the raw captured frames + intermediates here (debug); default: temp, deleted.
//
// Manifest (the web codes against these ids / aspect ratios — do not rename):
//   brain-orbit 1:1 720×720 · sections-tab 4:3 720×540 · temp-note 4:3 720×540 ·
//   kanban 16:10 800×500 · slash-snippets 4:5 576×720 · sticky 4:5 576×720 ·
//   section-preview 16:10 800×500 · themes 1:1 720×720 (one variant).
//
// Each clip is a tight crop on one feature (UI in English, demo data only), 4–8 s, no audio, and
// loops seamlessly: either its end state is its start state, or its last fraction of a second
// crossfades into its first (capture-kit loopCrossfade). Capture = CDP screencast at a per-clip
// DPR so the crop is ≥ 2× the web size → lossless master at 2× web (longest side ≤ 1440) →
// web: VP9 webm + H.264 mp4 (faststart, yuv420p) + webp poster at the web size; marketing: H.264
// crf 17 at the master size. Effects / safety: same rules as demo-capture.cjs (throwaway profile
// + notes dir, never the NoteFlow CLI, no GitHub / Cloud; brain-orbit enables the local semantic
// index with the small embeddings model copied from .electron-dev/ai-models if present). Windows
// open on screen while recording: do not use the mouse/keyboard on them meanwhile.
// Requires: playwright (devDependency) and ffmpeg in the PATH. Review the result by eye.
// ─────────────────────────────────────────────────────────────────────────────
const HELP_LINES = 36

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  REPO, sleep, launchElectron, closeApp, injectOverlay, actor, startRecording, writeConcat, ffmpeg, probeDuration,
  waitEditorFocus, focusEditorEnd, reloadMain, makeMask, makeShadow, clipTime, fitAspect, loopCrossfade,
} = require('./lib/capture-kit.cjs')
const { ID, seedNotes } = require('./lib/demo-notes.cjs')

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' // smallest multilingual embeddings model
const TITLEBAR = 34 // CSS px of the custom titlebar (cropped out of most clips)
// Window sizes respect the main window's minimum (700×500, electron/main.ts); the encoder uses the
// real viewport anyway (ctx.size is replaced by it after launch).

const THEMES = {
  dark: { id: 'noteflow-dark', ink: '255,255,255' },
  light: { id: 'noteflow-light', ink: '22,34,58' },
}

// ── Demo text (English) ──────────────────────────────────────────────────────
const TEXT = {
  commands: [
    '```bash',
    '# Build + package the release',
    'npm ci',
    'npm run build',
    'npx electron-builder --win --publish never',
    'git tag v2.4.0 && git push --tags',
    '```',
  ].join('\n'),
  board: [
    '<!-- kanban done="Done" -->',
    '- To do',
    '  - [ ] Record the demo video 📅2026-11-12 🔺high',
    '  - [ ] Write the release notes',
    '  - [ ] Update the pricing page',
    '- In progress',
    '  - [ ] Press kit 📅2026-11-10',
    '  - [ ] Onboarding emails',
    '- Done',
    '  - [x] Freeze the feature list',
    '  - [x] Book the launch webinar',
    '<!-- /kanban -->',
  ].join('\n'),
  snippets: [
    { name: 'Daily standup', content: '### Standup — {date:dddd, MMMM D}\n\n- **Yesterday:** wrapped up the pricing page\n- **Today:** launch checklist\n- **Blockers:** none' },
    { name: 'Meeting', content: '## Meeting — {date:DD-MM-YYYY}\n\n**Attendees:** \n\n- [ ] ' },
    { name: 'Signature', content: '— Alex, {date:DD-MM-YYYY}' },
  ],
  tempTitle: 'Hotfix deploy',
  tempCommand: 'docker build -t api:hotfix .\ndocker push registry.example.com/api:hotfix\nkubectl rollout restart deploy/api',
  showcase: [
    '## Launch day',
    '',
    'Go live at **10:00 CET**, then watch the dashboards for an hour. Plan in [Roadmap](noteflow://nlaunch1/sroadm).',
    '',
    '- [x] Freeze the feature list',
    '- [x] Final QA pass',
    '- [ ] Publish the release notes 📅2026-11-12',
    '- [ ] Post the announcement',
    '',
    '```bash',
    'npm run dist -- --publish always',
    '```',
    '',
    '> Ship small, ship often.',
  ].join('\n'),
  ui: { openBrain: 'Open brain view', switchSection: 'Switch section' },
}

const LAUNCH_EXTRAS = [
  { id: 'sfaqxx', name: 'Launch FAQ', content: '- Is there a free plan? **Yes**, forever.\n- Does it work offline? Every note is a plain Markdown file.\n- Can I import from Notion? Yes — Settings → Import.' },
  { id: 'spress', name: 'Press kit', content: '- [x] Logo pack (SVG + PNG)\n- [ ] Product screenshots\n- [ ] Founder quote' },
]

// The theme sequence of the `themes` clip (ids from src/lib/themes.ts, labels as in Settings).
const THEME_TOUR = [
  ['noteflow-dark', 'NoteFlow Dark'], ['tokyo-night', 'Tokyo Night'], ['dracula', 'Dracula'],
  ['gruvbox-dark', 'GruvBox Dark'], ['noteflow-light', 'NoteFlow Light'], ['arctic-day', 'Arctic Day'],
]

// ── Helpers ──────────────────────────────────────────────────────────────────
const box = async (locator) => {
  const b = await locator.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}
const now = () => Date.now() / 1000
const placeKeys = (page, x, y) => page.evaluate(([x, y]) => window.__nfo.placeKeys(x, y), [x, y])

// Bounding box (CSS px, relative to `clip`) of whatever differs from the background in a
// screenshot of `clip` — used to frame the brain. Rows/columns need a few lit pixels to count
// (the floating ambient particles do not).
async function contentBox(page, clip, dir) {
  const png = path.join(dir, 'probe.png'), raw = path.join(dir, 'probe.raw')
  fs.writeFileSync(png, await page.screenshot({ clip }))
  const w = Math.round(clip.width / 2), h = Math.round(clip.height / 2)
  ffmpeg(['-i', png, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw])
  const b = fs.readFileSync(raw)
  const px = (x, y) => { const i = (y * w + x) * 3; return [b[i], b[i + 1], b[i + 2]] }
  const bg = px(2, h - 3)
  const lit = (x, y) => { const p = px(x, y); return Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > 26 }
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lit(x, y)) { rows[y]++; cols[x]++ }
  const span = (a) => [a.findIndex((n) => n >= 3), a.length - 1 - [...a].reverse().findIndex((n) => n >= 3)]
  const [x0, x1] = span(cols), [y0, y1] = span(rows)
  return { x: x0 * 2, y: y0 * 2, w: (x1 - x0) * 2, h: (y1 - y0) * 2 }
}

// The app's own appearance sync path: write ui-settings.json + tell the window to re-read it.
async function switchTheme(ctx, id) {
  fs.writeFileSync(path.join(ctx.notes, 'ui-settings.json'), JSON.stringify({ theme: id }, null, 2))
  await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('notes-updated'))
}

// ── Clips ────────────────────────────────────────────────────────────────────
// launch: { size (CSS px), scale (DPR), uiState, extraSections, tweak, files, full }
// run(ctx, a, theme) → { rec, crop (CSS px, any aspect: fitted here), from?, cuts?, sticky?, segments? }
// speed: playback speed-up · loop: crossfade seconds (0 = the take already ends where it starts)
const CLIPS = {
  // The brain alone, zoomed in, slowly turning on its own (auto-rotate), full notebook + local AI.
  'brain-orbit': {
    // A turning wireframe is costly to encode: the web files go 2-pass at a fixed rate, 24 fps.
    aspect: 1, web: [720, 720], speed: 1, loop: 0.8, rate: { fps: 24, webm: '620k', mp4: '650k' },
    // The brain renders at DPR ≤ 2 (BrainScene caps it): a 720 CSS px crop → 1440 px master. The
    // canvas is taller than the crop: the brain sits above the camera target, so the crop moves up
    // onto it without reaching the view's header row.
    launch: { size: { width: 1040, height: 930 }, scale: 2, full: true, uiState: { sidebarMode: 'floating' } },
    async run(ctx, _a, _theme, dir) {
      const { page } = ctx
      await page.evaluate((m) => window.noteflow.setAiSettings({ enabled: true, modelId: m }), MODEL)
      await page.evaluate(() => window.noteflow.aiSearch('launch plan', 3))
      await page.evaluate(() => localStorage.setItem('noteflow:brain-split-width', '25'))
      await reloadMain(ctx)
      await page.locator(`button[title="${TEXT.ui.openBrain}"]`).first().click()
      await page.locator('canvas').first().waitFor({ timeout: 10000 })
      // Wait for the index to settle (no progress pill) so content edges are all there.
      await page.waitForFunction(() => !/Indexing|Downloading model|Starting…/.test(document.body.innerText), null, { timeout: 120000 })
      await sleep(2500)
      const cb = await page.evaluate(() => {
        const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width - x.width)[0]
        const r = c.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })
      const head = 46 // the view's header row (title, node count, buttons) stays out
      const side = Math.min(720, cb.w, cb.h - head)
      const clip = { x: cb.x, y: cb.y + head, width: cb.w, height: cb.h - head }
      // Zoom in until the brain spans ~76% of the crop (it widens as it turns) (OrbitControls: ×0.95 distance per 100 px of
      // wheel, toward the target wherever the pointer is) — from a corner with no node under it.
      await page.mouse.move(cb.x + 12, cb.y + cb.h - 12)
      const before = await contentBox(page, clip, dir)
      const wheel = -(Math.log(before.w / (side * 0.76)) / Math.log(0.95)) * 100
      for (let left = wheel; Math.abs(left) > 1; left -= Math.sign(left) * Math.min(50, Math.abs(left))) {
        await page.mouse.wheel(0, Math.sign(left) * Math.min(50, Math.abs(left)))
        await sleep(60)
      }
      await sleep(2500)
      const bb = await contentBox(page, clip, dir)
      // Centre on the cerebrum: the box also holds the faint brain stem below it.
      const cx = clip.x + bb.x + bb.w / 2, cy = clip.y + bb.y + bb.h * 0.46
      const crop = {
        x: Math.max(cb.x, Math.min(cb.x + cb.w - side, cx - side / 2)),
        y: Math.max(clip.y, Math.min(cb.y + cb.h - side, cy - side / 2)),
        w: side, h: side,
      }
      const rec = await startRecording(page)
      await sleep(8600)
      return { rec: await rec.stop(), crop }
    },
  },

  // A project note: Ctrl+Tab cycles its sections (the section map on top) and wraps back.
  'sections-tab': {
    aspect: 4 / 3, web: [720, 540], speed: 1, loop: 0.3,
    launch: {
      size: { width: 720, height: TITLEBAR + 540 }, scale: 2,
      uiState: { activeNoteId: ID.launch, activeSectionId: 'stasks', sidebarMode: 'floating' },
      extraSections: { [ID.launch]: [{ id: 'scmds1', name: 'Commands', content: TEXT.commands }] },
    },
    async run({ page, size }, a) {
      await placeKeys(page, size.width / 2, size.height - 22)
      const rec = await startRecording(page)
      await sleep(700)
      // Tasks → Meeting notes → Commands → Roadmap → Tasks.
      for (let i = 0; i < 4; i++) { await a.keys('Control+Tab', null, 750); await sleep(1250) }
      await sleep(500)
      return { rec: await rec.stop(), crop: { x: 0, y: TITLEBAR, w: size.width, h: size.height - TITLEBAR } }
    },
  },

  // Ctrl+Shift+N → temporary note → name it → paste a command in a code block; "Deletes …" shows.
  'temp-note': {
    aspect: 4 / 3, web: [720, 540], speed: 1.15, loop: 0.5,
    launch: { size: { width: 720, height: TITLEBAR + 540 }, scale: 2, uiState: { activeNoteId: ID.review, activeSectionId: 'swinsx', sidebarMode: 'floating' } },
    async run({ page, size }, a) {
      const home = { x: 470, y: 380 }
      await placeKeys(page, size.width / 2, size.height - 22)
      await a.show(home.x, home.y)
      const rec = await startRecording(page)
      await sleep(600)
      await a.keys('Control+Shift+N')
      // The new note mounts with its title focused + selected on purpose, but the editor's own
      // autofocus can race it: once the note is up, put the focus on the title deterministically
      // (what the app means to do) and type over it.
      await page.getByText(/Deletes /).first().waitFor({ timeout: 5000 })
      await sleep(350)
      await page.evaluate(() => { const t = document.querySelector('input.text-xl'); t.focus(); t.select() })
      await page.waitForFunction(() => document.activeElement === document.querySelector('input.text-xl'), null, { timeout: 3000 })
      await sleep(100)
      await a.type(TEXT.tempTitle, { min: 40, max: 80 })
      await sleep(250)
      const ed = await box(page.locator('.ProseMirror').first())
      await a.clickAt(ed.x + 90, ed.y + 22, { ms: 650, after: 0 })
      await waitEditorFocus(page)
      await sleep(150)
      await a.type('```bash ', { min: 30, max: 55 })
      await sleep(250)
      await page.evaluate(([l]) => window.__nfo.keys(l, 900), [['Ctrl', 'V']])
      await sleep(170)
      // A real paste event (ProseMirror reads clipboardData) — the system clipboard is left alone.
      await page.evaluate((text) => {
        const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
        const dt = new DataTransfer()
        dt.setData('text/plain', text)
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      }, TEXT.tempCommand)
      await sleep(700)
      await a.moveTo(page.getByText(/Deletes /).last(), { fx: 1, dx: 70, ms: 800 })
      await sleep(1500)
      await a.move(home.x, home.y, 900)
      await sleep(500)
      return { rec: await rec.stop(), crop: { x: 0, y: TITLEBAR, w: size.width, h: size.height - TITLEBAR } }
    },
  },

  // An in-note kanban board: a card dragged to Done (it gets checked).
  kanban: {
    aspect: 1.6, web: [800, 500], speed: 1.1, loop: 0.6,
    launch: {
      size: { width: 900, height: TITLEBAR + 562 }, scale: 1.6,
      uiState: { activeNoteId: ID.launch, activeSectionId: 'sboard', sidebarMode: 'floating' },
      extraSections: { [ID.launch]: [{ id: 'sboard', name: 'Board', content: `## Launch board\n\n${TEXT.board}` }] },
    },
    async run({ page, size }, a) {
      const home = { x: 640, y: 540 }
      await a.show(home.x, home.y)
      const rec = await startRecording(page)
      await sleep(600)
      const card = page.locator('.kanban-column', { hasText: 'In progress' }).getByText('Press kit', { exact: true }).first()
      const last = await box(page.locator('.kanban-column', { hasText: 'Done' }).getByText('Book the launch webinar', { exact: true }).first())
      await a.moveTo(card, { fx: 0.4, ms: 900 })
      await sleep(250)
      const cb = await box(card)
      await a.dragFrom(cb.x + cb.width * 0.4, cb.y + cb.height / 2, last.x + cb.width * 0.4, last.y + last.height + 22, { ms: 1300, after: 700 })
      await a.move(home.x, home.y, 1000)
      await sleep(700)
      return { rec: await rec.stop(), crop: { x: 0, y: TITLEBAR, w: size.width, h: size.height - TITLEBAR } }
    },
  },

  // "/" opens the command menu; the cursor goes down to SNIPPETS and inserts one (today's date).
  'slash-snippets': {
    aspect: 0.8, web: [576, 720], speed: 1.1, loop: 0.5,
    launch: {
      size: { width: 700, height: 720 }, scale: 3,
      uiState: { activeNoteId: ID.standup, activeSectionId: 'sstand', sidebarMode: 'floating' },
      files: {
        'snippets.json': JSON.stringify(TEXT.snippets.map((sn, i) => ({
          id: `snipdem${i}`, name: sn.name, content: sn.content, createdAt: new Date().toISOString(), ...(i === 0 ? { isDefault: true } : {}),
        })), null, 2),
      },
    },
    async run({ page }, a) {
      await focusEditorEnd(page)
      for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
      await sleep(300)
      const caret = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
        const c = el.editor.view.coordsAtPos(el.editor.state.selection.from)
        return { x: c.left, y: c.top, top: el.getBoundingClientRect().top }
      })
      const home = { x: caret.x + 300, y: caret.y + 40 }
      await a.show(home.x, home.y)
      const rec = await startRecording(page)
      await sleep(600)
      await a.type('/', { min: 10, max: 20 })
      const menu = page.locator('.slash-menu').first()
      await menu.waitFor({ timeout: 3000 })
      await sleep(650)
      await a.moveTo(page.locator('.slash-menu-item').first(), { fx: 0.55, ms: 800 })
      await sleep(300)
      await a.moveTo(page.locator('.slash-menu-item').nth(1), { fx: 0.5, ms: 500 })
      await sleep(250)
      await a.moveTo(page.locator('.slash-menu-heading').first(), { fx: 0.45, ms: 500 })
      await sleep(250)
      await a.click(page.locator('.slash-menu-item--snippet', { hasText: TEXT.snippets[0].name }).first(), { fx: 0.45, ms: 550, pause: 450, after: 0 })
      await sleep(1700)
      await a.move(home.x, home.y, 1000)
      await sleep(500)
      // From the top of the editor (bullets above the caret) down to under the menu.
      return { rec: await rec.stop(), crop: { x: caret.x - 12, y: caret.top + 4, w: 420, h: 525 } }
    },
  },

  // A floating sticky (its own window, composited over the blurred main window): its title
  // dropdown switches section.
  sticky: {
    aspect: 0.8, web: [576, 720], speed: 1.1, loop: 0.6,
    launch: {
      size: { width: 900, height: 720 }, scale: 3,
      uiState: { activeNoteId: ID.launch, activeSectionId: 'stasks', sidebarMode: 'floating' },
      extraSections: { [ID.launch]: LAUNCH_EXTRAS },
    },
    sticky: { x: 290, y: 170, width: 344, height: 430 },
    async run(ctx, _a, theme) {
      const { app, page } = ctx
      const S = CLIPS.sticky.sticky
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
      await focusEditorEnd(page)
      const winP = app.waitForEvent('window')
      await page.keyboard.press('Control+S')
      const sticky = await winP
      await sticky.waitForLoadState('domcontentloaded')
      await sticky.waitForSelector('.ProseMirror')
      const layout = await app.evaluate(({ BrowserWindow }, S) => {
        const all = BrowserWindow.getAllWindows()
        const main = all.find((w) => !w.webContents.getURL().includes('#'))
        const st = all.find((w) => w.webContents.getURL().includes('#sticky'))
        const m = main.getContentBounds()
        st.setBounds({ x: m.x + S.x, y: m.y + S.y, width: S.width, height: S.height })
        st.focus()
        return { main: m, sticky: st.getContentBounds() }
      }, S)
      await sleep(600)
      // No caret / focus ring in the main window behind.
      await page.evaluate(() => document.activeElement?.blur())
      await sleep(300)
      const bg = await page.screenshot()
      await injectOverlay(sticky, { ink: theme.ink })
      await sticky.evaluate(() => document.activeElement?.blur())
      const s = actor(sticky)
      const home = { x: S.width * 0.62, y: S.height * 0.72 }
      await s.show(home.x, home.y)
      const rec = await startRecording(sticky)
      await sleep(600)
      const trigger = sticky.locator(`button[title="${TEXT.ui.switchSection}"]`).first()
      await s.click(trigger, { fx: 0.4, ms: 950, after: 600 })
      await s.moveTo(sticky.locator('[role="menuitemradio"]', { hasText: 'Roadmap' }).first(), { fx: 0.35, ms: 500 })
      await sleep(300)
      await s.click(sticky.locator('[role="menuitemradio"]', { hasText: 'Meeting notes' }).first(), { fx: 0.35, ms: 500, pause: 300, after: 500 })
      await sleep(900)
      await s.move(home.x, home.y, 1000)
      await sleep(600)
      const off = { x: layout.sticky.x - layout.main.x, y: layout.sticky.y - layout.main.y }
      const m = 46
      return {
        rec: await rec.stop(), bg, off,
        crop: { x: off.x - m, y: off.y - m, w: layout.sticky.width + 2 * m, h: layout.sticky.height + 2 * m },
      }
    },
  },

  // Sidebar: a note's folded section map unfolds; resting on a cell shows the section preview.
  'section-preview': {
    aspect: 1.6, web: [800, 500], speed: 1.1, loop: 0.5,
    launch: {
      size: { width: 700, height: 660 }, scale: 2.1,
      uiState: { activeNoteId: ID.launch, activeSectionId: 'sroadm', sidebarMode: 'pinned', collapsedGroupIds: [ID.gPersonal, ID.gLearn], collapsedFolderIds: [ID.fEng] },
      extraSections: { [ID.hiring]: [{ id: 'shirx0', name: 'Offers', content: '- Ana — offer sent, answer by Friday' }, { id: 'shirx1', name: 'Onboarding', content: '- [ ] Laptop + accounts\n- [ ] First-week buddy' }] },
      // No favourites: the groups start higher, so the crop can begin right under the section tabs.
      tweak: (c) => { for (const n of c.notes) delete n.favorited },
    },
    async run({ app, page, size }, a) {
      // The section map / preview only open in a focused window.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus())
      await page.evaluate(() => document.activeElement?.blur())
      const row = await box(page.locator(`button[data-note-id="${ID.hiring}"]`).first())
      const home = { x: 610, y: row.y + 52 } // right of the note's heading, over nothing
      await a.show(home.x, home.y)
      await page.mouse.move(home.x, home.y)
      const rec = await startRecording(page)
      await sleep(600)
      const line = await a.moveTo(page.locator(`button[data-note-id="${ID.hiring}"] .nsm-line`).first(), { fx: 0.3, ms: 1000 })
      await page.locator('.nsm-peek .nsm-cell').first().waitFor({ timeout: 4000 })
      await sleep(550)
      await a.move(line.x + 40, line.y + 2, 400)
      await a.moveTo(page.locator('.nsm-peek .nsm-cell', { hasText: 'Interview loop' }).first(), { fx: 0.45, ms: 550 })
      const card = page.locator('.section-hover-card').first()
      await card.waitFor({ timeout: 4000 })
      await sleep(400)
      const cb = await box(card)
      await sleep(1500)
      await a.move(home.x, home.y, 1000)
      await sleep(900)
      // The whole window width (the editor's lines wrap inside it), from just under the section tabs
      // (title + toolbar whole) — lower only if the card would not fit.
      const tabsBottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.section-map-tab')].map((t) => t.getBoundingClientRect().bottom)))
      const h = size.width / 1.6
      const top = Math.max(tabsBottom + 6, cb.y + cb.height + 20 - h)
      return { rec: await rec.stop(), crop: { x: 0, y: top, w: size.width, h } }
    },
  },

  // The same note through six themes (the app's appearance-sync path), crossfaded.
  themes: {
    aspect: 1, web: [720, 720], speed: 1, loop: 0.35, single: true,
    launch: {
      size: { width: 800, height: 800 }, scale: 1.8,
      uiState: { activeNoteId: ID.launch, activeSectionId: 'sshowc', sidebarMode: 'pinned', collapsedGroupIds: [ID.gLearn], collapsedFolderIds: [ID.fEng] },
      extraSections: { [ID.launch]: [{ id: 'sshowc', name: 'Launch day', content: TEXT.showcase }] },
    },
    async run(ctx) {
      const { page, size } = ctx
      await page.evaluate(() => document.activeElement?.blur())
      await placeKeys(page, size.width / 2 + 150, size.height - 26)
      const rec = await startRecording(page)
      const segments = []
      for (const [id, label] of THEME_TOUR) {
        if (id !== THEME_TOUR[0][0]) await switchTheme(ctx, id)
        segments.push(now())
        await page.evaluate(([l]) => window.__nfo.keys(l, 1150), [[label]])
        await sleep(1350)
      }
      return { rec: await rec.stop(), segments, crop: { x: 0, y: 0, w: size.width, h: size.height } }
    },
  },
}

const MANIFEST = Object.keys(CLIPS)

// ── Encoding ─────────────────────────────────────────────────────────────────
const even = (v) => Math.max(2, Math.round(v / 2) * 2)

// Master size: 2× the web size, longest side capped at 1440.
function masterSize([w, h]) {
  const k = Math.min(2, 1440 / Math.max(w, h))
  return [even(w * k), even(h * k)]
}

// CSS-px crop → ffmpeg crop (frame px) + scale to the master size.
function cropScale(crop, k, frameW, frameH, [MW, MH]) {
  const cw = Math.min(even(crop.w * k), frameW - (frameW % 2)), ch = Math.min(even(crop.h * k), frameH - (frameH % 2))
  const cx = Math.max(0, Math.min(frameW - cw, Math.round(crop.x * k))), cy = Math.max(0, Math.min(frameH - ch, Math.round(crop.y * k)))
  if (cw < MW * 0.95 || ch < MH * 0.95) console.warn(`  note: crop ${cw}×${ch} px is upscaled to ${MW}×${MH}`)
  return `crop=${cw}:${ch}:${cx}:${cy},scale=${MW}:${MH}:flags=lanczos`
}

// The take → lossless master (ffv1) at the master size, 30 fps.
function encodeMaster(clip, result, dir, scale, size) {
  const M = masterSize(clip.web)
  const crop = fitAspect(result.crop, clip.aspect, result.bounds || { w: size.width, h: size.height })
  const master = path.join(dir, 'master.mkv')
  const list = writeConcat(result.rec, path.join(dir, 'frames'), { from: result.from, cuts: result.cuts || [], speed: clip.speed })
  if (result.bg) return encodeStickyMaster(clip, result, list, crop, dir, scale, M, master)
  const k = list.frameW / size.width
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list.listPath, '-vf', `fps=30,${cropScale(crop, k, list.frameW, list.frameH, M)},format=yuv444p`,
    '-c:v', 'ffv1', '-an', master])
  if (!result.segments) return master
  return crossfadeSegments(master, result.segments.map((ts) => clipTime(ts, result.rec.t0, result.cuts || [], clip.speed)), dir)
}

// Sticky: its frames over the (blurred, dimmed) main window screenshot, rounded mask + shadow.
function encodeStickyMaster(clip, result, list, crop, dir, scale, M, master) {
  const bgFile = path.join(dir, 'bg.png')
  fs.writeFileSync(bgFile, result.bg)
  const px = (v) => Math.round(v * scale)
  const sm = px(24)
  const sMask = path.join(dir, 'smask.png'); makeMask(sMask, list.frameW, list.frameH, px(8))
  const sSh = path.join(dir, 'sshadow.png'); makeShadow(sSh, list.frameW, list.frameH, sm, 175)
  const x = px(result.off.x), y = px(result.off.y)
  const fc = [
    `[0:v]format=rgba,gblur=sigma=${px(2.2)},colorchannelmixer=rr=0.82:gg=0.82:bb=0.82[bg]`,
    '[1:v]fps=30,format=rgba[sv]', '[2:v]format=gray[sk]', '[sv][sk]alphamerge[st]', '[3:v]format=rgba[sh]',
    `[bg][sh]overlay=${x - sm}:${y - sm + px(10)}[b1]`, `[b1][st]overlay=${x}:${y}:shortest=1[b2]`,
    `[b2]${cropScale(crop, scale, 1e9, 1e9, M)},format=yuv444p[out]`,
  ].join(';')
  ffmpeg(['-loop', '1', '-framerate', '30', '-i', bgFile, '-f', 'concat', '-safe', '0', '-i', list.listPath,
    '-loop', '1', '-framerate', '30', '-i', sMask, '-loop', '1', '-framerate', '30', '-i', sSh,
    '-filter_complex', fc, '-map', '[out]', '-t', list.duration.toFixed(3), '-c:v', 'ffv1', '-an', master])
  return master
}

// `themes`: hard switches → short crossfades between the holds. Segment i = [switch i, switch
// i+1); each xfade blends the last `d` s of the old theme with the first `d` s of the new one.
function crossfadeSegments(master, starts, dir, d = 0.3) {
  const dur = probeDuration(master)
  const bounds = starts.map((s, i) => [i === 0 ? 0 : s + 0.05, i + 1 < starts.length ? starts[i + 1] : dur])
  const parts = bounds.map(([s, e], i) => `[0:v]trim=start=${s.toFixed(3)}:end=${e.toFixed(3)},setpts=PTS-STARTPTS,settb=1/30[s${i}]`)
  let chain = '', prev = 's0', acc = bounds[0][1] - bounds[0][0]
  for (let i = 1; i < bounds.length; i++) {
    const out = i === bounds.length - 1 ? 'out' : `x${i}`
    chain += `;[${prev}][s${i}]xfade=transition=fade:duration=${d}:offset=${(acc - d).toFixed(3)}[${out}]`
    acc += bounds[i][1] - bounds[i][0] - d
    prev = out
  }
  const file = path.join(dir, 'segments.mkv')
  ffmpeg(['-i', master, '-filter_complex', parts.join(';') + chain, '-map', '[out]', '-c:v', 'ffv1', '-an', file])
  return file
}

// Web files: constant quality by default; `clip.rate` = 2-pass at a fixed bitrate (+ fps) instead.
function encodeOutputs(clip, looped, webBase, mkFile, dir) {
  const [W, H] = clip.web
  const crf = clip.crf || {}
  const rate = clip.rate
  const vf = `${rate ? `fps=${rate.fps},` : ''}scale=${W}:${H}:flags=lanczos,format=yuv420p`
  const twoPass = (codecArgs, out, extra) => {
    const log = path.join(dir, `pass-${path.extname(out).slice(1)}`)
    ffmpeg(['-i', looped, '-vf', vf, ...codecArgs, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'])
    ffmpeg(['-i', looped, '-vf', vf, ...codecArgs, '-pass', '2', '-passlogfile', log, ...extra, '-an', out])
  }
  const vp9 = ['-c:v', 'libvpx-vp9', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '1']
  const x264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-profile:v', 'high']
  if (rate) twoPass([...vp9, '-b:v', rate.webm], webBase + '.webm', [])
  else ffmpeg(['-i', looped, '-vf', vf, ...vp9, '-crf', String(crf.webm ?? 36), '-b:v', '0', '-an', webBase + '.webm'])
  if (rate) twoPass([...x264, '-b:v', rate.mp4], webBase + '.mp4', ['-movflags', '+faststart'])
  else ffmpeg(['-i', looped, '-vf', vf, ...x264, '-crf', String(crf.mp4 ?? 25), '-movflags', '+faststart', '-an', webBase + '.mp4'])
  ffmpeg(['-i', looped, '-frames:v', '1', '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '82', webBase + '.webp'])
  if (mkFile) {
    ffmpeg(['-i', looped, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high',
      '-movflags', '+faststart', '-an', mkFile])
  }
}

function sampleClip(video, dir, n = 5) {
  fs.mkdirSync(dir, { recursive: true })
  const dur = probeDuration(video)
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? 0 : (dur * i) / (n - 1) - (i === n - 1 ? 0.05 : 0)
    ffmpeg(['-ss', t.toFixed(3), '-i', video, '-frames:v', '1', path.join(dir, `${path.parse(video).name}-${i}.png`)])
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function recordVariant(opts, id, variant, work) {
  const clip = CLIPS[id]
  const theme = variant ? THEMES[variant] : THEMES.dark
  const L = clip.launch
  const ctx = await launchElectron({
    appDir: opts.app, scale: L.scale, size: L.size, tmpPrefix: 'nf-mosaic-',
    seed: ({ notes, profile }) => {
      seedNotes(notes, 'en', L.extraSections || {}, L.tweak || null, { full: !!L.full })
      for (const [name, content] of Object.entries(L.files || {})) fs.writeFileSync(path.join(notes, name), content)
      if (L.full) {
        const cached = path.join(REPO, '.electron-dev', 'ai-models', ...MODEL.split('/'))
        if (fs.existsSync(cached)) fs.cpSync(cached, path.join(profile, 'ai-models', ...MODEL.split('/')), { recursive: true })
      }
      fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
        language: 'en', theme: theme.id, openAtLogin: false, uiState: L.uiState,
      }, null, 2))
    },
  })
  const name = variant ? `${id}-${variant}` : id
  const dir = path.join(work, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  let result
  try {
    const vp = await ctx.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    if (vp.width !== L.size.width || vp.height !== L.size.height) console.warn(`  note: viewport is ${vp.width}×${vp.height}, not ${L.size.width}×${L.size.height}`)
    ctx.size = vp
    await ctx.page.evaluate(() => document.activeElement?.blur())
    await injectOverlay(ctx.page, { ink: theme.ink })
    result = await clip.run(ctx, actor(ctx.page), theme, dir)
  } finally {
    await closeApp(ctx)
  }
  const master = encodeMaster(clip, result, dir, L.scale, ctx.size)
  const looped = path.join(dir, 'looped.mkv')
  loopCrossfade(master, looped, clip.loop)
  const webBase = path.join(opts.out, name)
  const mk = opts.marketing ? path.join(opts.marketing, `${name}.mp4`) : null
  encodeOutputs(clip, looped, webBase, mk, dir)
  if (opts.samples) sampleClip(webBase + '.webm', opts.samples)
  return [webBase + '.webm', webBase + '.mp4', webBase + '.webp', ...(mk ? [mk] : [])]
}

function parseArgs(argv) {
  const o = { app: REPO, only: null, theme: 'all', out: path.join(REPO, 'docs', 'public', 'mosaic'), marketing: null, samples: null, frames: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--app') o.app = path.resolve(next())
    else if (a === '--only') o.only = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--theme') o.theme = next()
    else if (a === '--out') o.out = path.resolve(next())
    else if (a === '--marketing') o.marketing = path.resolve(next())
    else if (a === '--samples') o.samples = path.resolve(next())
    else if (a === '--frames') o.frames = path.resolve(next())
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, HELP_LINES).join('\n')); process.exit(0) }
    else throw new Error(`Unknown argument: ${a}`)
  }
  if (o.only) for (const id of o.only) if (!CLIPS[id]) throw new Error(`Unknown clip id: ${id}`)
  if (!['dark', 'light', 'all'].includes(o.theme)) throw new Error('--theme must be dark, light or all')
  return o
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(path.join(opts.app, 'dist', 'index.html')) || !fs.existsSync(path.join(opts.app, 'dist-electron', 'main.js'))) {
    throw new Error(`${opts.app} has no built dist/ + dist-electron/ (run npm run build there)`)
  }
  for (const d of [opts.out, opts.marketing, opts.samples]) if (d) fs.mkdirSync(d, { recursive: true })
  const work = opts.frames || fs.mkdtempSync(path.join(os.tmpdir(), 'nf-mosaic-frames-'))
  const variants = opts.theme === 'all' ? ['dark', 'light'] : [opts.theme]
  const failed = []
  try {
    for (const id of opts.only || MANIFEST) {
      for (const variant of CLIPS[id].single ? [null] : variants) {
        const name = variant ? `${id}-${variant}` : id
        console.log(`- ${name} …`)
        try {
          for (const file of await recordVariant(opts, id, variant, work)) {
            const kb = (fs.statSync(file).size / 1024).toFixed(0)
            const dur = file.endsWith('.webp') ? '' : `${probeDuration(file).toFixed(2)}s, `
            console.log(`  ${path.relative(REPO, file)}: ${dur}${kb} KB`)
          }
        } catch (err) {
          failed.push(name)
          console.error(err)
        }
      }
    }
  } finally {
    if (!opts.frames) fs.rmSync(work, { recursive: true, force: true })
  }
  if (failed.length) { console.error(`Failed: ${failed.join(', ')}`); process.exit(1) }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1) })
}

module.exports = { CLIPS, MANIFEST, THEMES }
