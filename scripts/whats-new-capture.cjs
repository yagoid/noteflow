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
//   Requires: playwright (devDependency) and ffmpeg in the PATH. The output is a set of real
//   screenshots of the UI: re-record after visible UI changes and review the clips by eye.
// ─────────────────────────────────────────────────────────────────────────────
const HELP_LINES = 39

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rand = (a, b) => a + Math.random() * (b - a)

// ── Demo content ────────────────────────────────────────────────────────────
// Stable ids so scenarios can address notes/sections directly.
const ID = {
  gWork: 'grpwork1', gPersonal: 'grppers1', gLearn: 'grplern1',
  fProduct: 'fldprod1', fEng: 'fldeng01',
  launch: 'nlaunch1', api: 'napides1', reading: 'nreadin1', design: 'ndesign1', hiring: 'nhiring1',
  review: 'nreview1', lisbon: 'nlisbon1', ideas: 'nideas01', rust: 'nrustln1', research: 'nresrch1',
  okrs: 'nokrs001', recipes: 'nrecipe1', standup: 'nstandu1', habits: 'nhabits1',
}

function demoContent(lang) {
  const es = lang === 'es'
  const L = (en, esText) => (es ? esText : en)
  const rel = (name, noteId, secId) => `[${name}](noteflow://${noteId}/${secId})`

  const groups = [
    { id: ID.gWork, name: L('Work', 'Trabajo'), color: '--accent', order: 0 },
    { id: ID.gPersonal, name: L('Personal', 'Personal'), color: '--pink', order: 1 },
    { id: ID.gLearn, name: L('Learning', 'Aprendizaje'), color: '--cyan', order: 2 },
  ]
  const folders = [
    { id: ID.fProduct, name: L('Product', 'Producto'), groupId: ID.gWork, order: 0 },
    { id: ID.fEng, name: L('Engineering', 'Ingeniería'), groupId: ID.gWork, order: 1 },
  ]

  // Section names used by relations (kept in one place so pills read right).
  const S = {
    roadmap: L('Roadmap', 'Roadmap'), tasks: L('Tasks', 'Tareas'), meeting: L('Meeting notes', 'Notas de reunión'),
    endpoints: L('Endpoints', 'Endpoints'), auth: L('Auth', 'Autenticación'), openq: L('Open questions', 'Preguntas abiertas'),
    books: L('Books', 'Libros'), articles: L('Articles', 'Artículos'),
    colors: L('Colors', 'Colores'), components: L('Components', 'Componentes'),
    candidates: L('Candidates', 'Candidatos'), loop: L('Interview loop', 'Entrevistas'),
    wins: L('Wins', 'Logros'), next: L('Next week', 'Próxima semana'),
    itinerary: L('Itinerary', 'Itinerario'), packing: L('Packing', 'Equipaje'),
    inbox: L('Inbox', 'Bandeja'), ownership: L('Ownership', 'Ownership'), async: L('Async', 'Async'),
    interviews: L('User interviews', 'Entrevistas a usuarios'), insights: L('Insights', 'Hallazgos'),
    q4: L('Q4 goals', 'Objetivos Q4'), metrics: L('Metrics', 'Métricas'),
    weeknight: L('Weeknight', 'Entre semana'), standup: L('Monday', 'Lunes'), habits: L('Daily', 'Diario'),
  }

  const notes = [
    {
      id: ID.launch, title: L('Product launch', 'Lanzamiento del producto'), group: ID.gWork, folder: ID.fProduct, daysAgo: 6, favorited: true,
      sections: [
        { id: 'sroadm', name: S.roadmap, content: [
          L('## Q4 launch plan', '## Plan de lanzamiento Q4'),
          '',
          L('Ship the public beta in **three waves**, one every two weeks.', 'Lanzar la beta pública en **tres oleadas**, una cada dos semanas.'),
          '',
          L('- **Wave 1** — private beta with 50 design partners', '- **Oleada 1** — beta privada con 50 clientes piloto'),
          L('- **Wave 2** — waitlist opens, pricing page goes live', '- **Oleada 2** — se abre la lista de espera y la página de precios'),
          L('- **Wave 3** — public launch + press kit', '- **Oleada 3** — lanzamiento público + kit de prensa'),
          '',
          L(`Depends on ${rel(S.endpoints, ID.api, 'sendpt')} and ${rel(S.components, ID.design, 'scompo')}.`,
            `Depende de ${rel(S.endpoints, ID.api, 'sendpt')} y ${rel(S.components, ID.design, 'scompo')}.`),
        ].join('\n') },
        { id: 'stasks', name: S.tasks, content: [
          L('- [x] Freeze the feature list', '- [x] Cerrar la lista de funcionalidades'),
          L('- [x] Book the launch webinar', '- [x] Reservar el webinar de lanzamiento'),
          L('- [ ] Write the release notes', '- [ ] Escribir las notas de versión'),
          L('- [ ] Record the demo video', '- [ ] Grabar el vídeo de demo'),
          L('- [ ] Final QA pass on Windows and macOS', '- [ ] Último repaso de QA en Windows y macOS'),
          '',
          L(`Hiring: ${rel(S.candidates, ID.hiring, 'scandi')}`, `Contratación: ${rel(S.candidates, ID.hiring, 'scandi')}`),
        ].join('\n') },
        { id: 'smeetn', name: S.meeting, content: [
          L('### Kick-off — Monday', '### Kick-off — lunes'),
          L('- Marketing wants the landing page one week earlier', '- Marketing quiere la landing una semana antes'),
          L('- Support needs a FAQ before wave 2', '- Soporte necesita una FAQ antes de la oleada 2'),
          L('- Decision: pricing stays at three tiers', '- Decisión: los precios se quedan en tres planes'),
          '',
          L(`Follow-up in ${rel(S.metrics, ID.okrs, 'smetri')}`, `Seguimiento en ${rel(S.metrics, ID.okrs, 'smetri')}`),
        ].join('\n') },
      ],
    },
    {
      id: ID.api, title: L('API design', 'Diseño de la API'), group: ID.gWork, folder: ID.fEng, daysAgo: 9,
      sections: [
        { id: 'sendpt', name: S.endpoints, content: [
          L('## REST endpoints', '## Endpoints REST'),
          '',
          '- `GET /v1/projects` — ' + L('list projects', 'listar proyectos'),
          '- `POST /v1/projects` — ' + L('create a project', 'crear un proyecto'),
          '- `PATCH /v1/projects/:id` — ' + L('partial update', 'actualización parcial'),
          '',
          L(`Auth flow in ${rel(S.auth, ID.api, 'sauthx')}.`, `Flujo de login en ${rel(S.auth, ID.api, 'sauthx')}.`),
        ].join('\n') },
        { id: 'sauthx', name: S.auth, content: [
          L('OAuth 2.0 with PKCE. Tokens expire after **15 min**.', 'OAuth 2.0 con PKCE. Los tokens caducan a los **15 min**.'),
          '',
          L('- Refresh tokens rotate on every use', '- Los refresh tokens rotan en cada uso'),
          L('- Scopes: `read`, `write`, `admin`', '- Scopes: `read`, `write`, `admin`'),
        ].join('\n') },
        { id: 'sopenq', name: S.openq, content: [
          L('- Do we need cursor-based pagination from day one?', '- ¿Necesitamos paginación por cursor desde el primer día?'),
          L('- Rate limits per key or per workspace?', '- ¿Límites por clave o por espacio de trabajo?'),
          '',
          L(`See ${rel(S.roadmap, ID.launch, 'sroadm')}`, `Ver ${rel(S.roadmap, ID.launch, 'sroadm')}`),
        ].join('\n') },
      ],
    },
    {
      id: ID.design, title: L('Design system', 'Sistema de diseño'), group: ID.gWork, folder: ID.fProduct, daysAgo: 12,
      sections: [
        { id: 'scolor', name: S.colors, content: L('Primary `#E5484D`, neutrals from slate. Dark mode first.', 'Primario `#E5484D`, neutros de slate. Primero el modo oscuro.') },
        { id: 'scompo', name: S.components, content: [
          L('- Button, Input, Select — **done**', '- Button, Input, Select — **hecho**'),
          L('- Modal, Toast — in review', '- Modal, Toast — en revisión'),
          L('- Data table — next sprint', '- Tabla de datos — próximo sprint'),
          '',
          L(`Tokens: ${rel(S.colors, ID.design, 'scolor')}`, `Tokens: ${rel(S.colors, ID.design, 'scolor')}`),
        ].join('\n') },
      ],
    },
    {
      id: ID.hiring, title: L('Hiring', 'Contratación'), group: ID.gWork, daysAgo: 15,
      sections: [
        { id: 'scandi', name: S.candidates, content: [
          L('- Ana — senior frontend, strong on accessibility', '- Ana — frontend senior, muy fuerte en accesibilidad'),
          L('- Marc — backend, Go + Postgres', '- Marc — backend, Go + Postgres'),
          '',
          L(`Process: ${rel(S.loop, ID.hiring, 'sloopx')}`, `Proceso: ${rel(S.loop, ID.hiring, 'sloopx')}`),
        ].join('\n') },
        { id: 'sloopx', name: S.loop, content: L('1. Intro call\n2. Take-home (2h max)\n3. Pairing session\n4. Team chat', '1. Llamada inicial\n2. Prueba en casa (máx. 2h)\n3. Sesión de pairing\n4. Charla con el equipo') },
      ],
    },
    {
      id: ID.okrs, title: L('Team OKRs', 'OKRs del equipo'), group: ID.gWork, daysAgo: 20,
      sections: [
        { id: 'sq4gol', name: S.q4, content: L(`- Launch the public beta (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Hire two engineers`, `- Lanzar la beta pública (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Contratar a dos ingenieros`) },
        { id: 'smetri', name: S.metrics, content: L('- Weekly active users: **1,240**\n- Activation rate: **38%**\n- NPS: **52**', '- Usuarios activos semanales: **1.240**\n- Tasa de activación: **38%**\n- NPS: **52**') },
      ],
    },
    {
      id: ID.standup, title: L('Standup notes', 'Notas del daily'), group: ID.gWork, folder: ID.fEng, daysAgo: 1,
      sections: [
        { id: 'sstand', name: S.standup, content: L(`- Unblocked the auth refactor (${rel(S.auth, ID.api, 'sauthx')})\n- Pairing with Ana on the table component`, `- Desbloqueado el refactor de login (${rel(S.auth, ID.api, 'sauthx')})\n- Pairing con Ana en el componente de tabla`) },
      ],
    },
    {
      id: ID.research, title: L('User research', 'Investigación de usuarios'), group: ID.gWork, folder: ID.fProduct, daysAgo: 8,
      sections: [
        { id: 'sinter', name: S.interviews, content: L('Eight interviews done. People want **faster capture** and offline mode.', 'Ocho entrevistas hechas. Piden **captura más rápida** y modo offline.') },
        { id: 'sinsig', name: S.insights, content: L(`- Keyboard-first is a must\n- Feeds into ${rel(S.roadmap, ID.launch, 'sroadm')}`, `- Imprescindible poder usarlo solo con teclado\n- Alimenta el ${rel(S.roadmap, ID.launch, 'sroadm')}`) },
      ],
    },
    {
      id: ID.reading, title: L('Reading list', 'Lista de lectura'), group: ID.gLearn, daysAgo: 4,
      sections: [
        { id: 'sbooks', name: S.books, content: L('- [x] *Shape Up* — Ryan Singer\n- [ ] *The Pragmatic Programmer*\n- [ ] *Designing Data-Intensive Applications*', '- [x] *Shape Up* — Ryan Singer\n- [ ] *El programador pragmático*\n- [ ] *Designing Data-Intensive Applications*') },
        { id: 'sartic', name: S.articles, content: L(`- Local-first software (Ink & Switch)\n- Related: ${rel(S.ownership, ID.ideas, 'sownsh')}`, `- Local-first software (Ink & Switch)\n- Relacionado: ${rel(S.ownership, ID.ideas, 'sownsh')}`) },
      ],
    },
    {
      id: ID.rust, title: L('Learning Rust', 'Aprendiendo Rust'), group: ID.gLearn, daysAgo: 18,
      sections: [
        { id: 'srust1', name: L('Ownership', 'Ownership'), content: L('Every value has a single owner. Borrowing: `&T` shared, `&mut T` exclusive.', 'Cada valor tiene un único dueño. Préstamos: `&T` compartido, `&mut T` exclusivo.') },
        { id: 'srust2', name: L('Exercises', 'Ejercicios'), content: L(`- [x] Rustlings 1–20\n- [ ] Build a CLI todo app\n- [ ] Read ${rel(S.books, ID.reading, 'sbooks')}`, `- [x] Rustlings 1–20\n- [ ] Hacer una app de tareas en CLI\n- [ ] Leer ${rel(S.books, ID.reading, 'sbooks')}`) },
      ],
    },
    {
      id: ID.ideas, title: L('Ideas', 'Ideas'), group: ID.gLearn, daysAgo: 3,
      sections: [
        { id: 'sinbox', name: S.inbox, content: L('- A weekly digest of my notes\n- Voice memos → notes', '- Un resumen semanal de mis notas\n- Notas de voz → notas') },
        { id: 'sownsh', name: S.ownership, content: L('Own your data: plain Markdown files, synced where *you* decide.', 'Tus datos son tuyos: Markdown plano, sincronizado donde *tú* decidas.') },
      ],
    },
    {
      id: ID.review, title: L('Weekly review', 'Revisión semanal'), group: ID.gPersonal, daysAgo: 2,
      sections: [
        { id: 'swinsx', name: S.wins, content: L(`- Finished the launch plan (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Ran three times`, `- Terminado el plan de lanzamiento (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Salí a correr tres veces`) },
        { id: 'snextw', name: S.next, content: L(`- Prepare ${rel(S.itinerary, ID.lisbon, 'sitine')}\n- Finish *Shape Up*`, `- Preparar el ${rel(S.itinerary, ID.lisbon, 'sitine')}\n- Terminar *Shape Up*`) },
      ],
    },
    {
      id: ID.lisbon, title: L('Trip to Lisbon', 'Viaje a Lisboa'), group: ID.gPersonal, daysAgo: 10,
      sections: [
        { id: 'sitine', name: S.itinerary, content: L('- **Fri** — Alfama + Fado night\n- **Sat** — Sintra day trip\n- **Sun** — LX Factory, Belém', '- **Vie** — Alfama + noche de fado\n- **Sáb** — excursión a Sintra\n- **Dom** — LX Factory, Belém') },
        { id: 'spacki', name: S.packing, content: L('- [ ] Passport\n- [ ] Charger\n- [x] Comfortable shoes', '- [ ] Pasaporte\n- [ ] Cargador\n- [x] Zapatillas cómodas') },
      ],
    },
    {
      id: ID.recipes, title: L('Recipes', 'Recetas'), group: ID.gPersonal, daysAgo: 25,
      sections: [
        { id: 'swknit', name: S.weeknight, content: L('- Lemon pasta (15 min)\n- Chickpea curry\n- Shakshuka', '- Pasta al limón (15 min)\n- Curry de garbanzos\n- Shakshuka') },
      ],
    },
    {
      id: ID.habits, title: L('Habits', 'Hábitos'), group: ID.gPersonal, daysAgo: 5,
      sections: [
        { id: 'shabit', name: S.habits, content: L(`- [x] 20 min reading (${rel(S.books, ID.reading, 'sbooks')})\n- [ ] Stretch\n- [x] No phone after 22:00`, `- [x] 20 min de lectura (${rel(S.books, ID.reading, 'sbooks')})\n- [ ] Estirar\n- [x] Sin móvil después de las 22:00`) },
      ],
    },
  ]
  return { groups, folders, notes, S }
}

function noteDirname(id, title) {
  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40)
  return `${slug ? `${slug}-` : ''}${id}`
}

function yamlStr(s) { return JSON.stringify(s) }

// Writes the v2 note folders + groups/folders JSON straight into the temp notes dir.
function seedNotes(notesDir, lang, extraSections = {}) {
  const { groups, folders, notes } = demoContent(lang)
  for (const n of notes) if (extraSections[n.id]) n.sections.push(...extraSections[n.id])
  fs.writeFileSync(path.join(notesDir, '.noteflow-format'), '2')
  fs.writeFileSync(path.join(notesDir, 'groups.json'), JSON.stringify(groups, null, 2))
  fs.writeFileSync(path.join(notesDir, 'folders.json'), JSON.stringify(folders, null, 2))
  const now = Date.now()
  for (const n of notes) {
    const created = new Date(now - n.daysAgo * 86400000 - 3600000 * 3).toISOString()
    const updated = new Date(now - n.daysAgo * 86400000 * 0.4 - 600000).toISOString()
    const dir = path.join(notesDir, noteDirname(n.id, n.title))
    fs.mkdirSync(dir, { recursive: true })
    const lines = ['---', `id: ${n.id}`, `title: ${yamlStr(n.title)}`, 'tags: []', `created: ${created}`, `updated: ${updated}`, 'formatVersion: 2']
    if (n.group) lines.push(`group: ${n.group}`)
    if (n.folder) lines.push(`folder: ${n.folder}`)
    if (n.favorited) lines.push('favorited: true')
    lines.push('sections:')
    for (const s of n.sections) {
      lines.push(`  - id: ${s.id}`, `    name: ${yamlStr(s.name)}`, `    file: ${s.id}.md`, `    created: ${yamlStr(created)}`)
      fs.writeFileSync(path.join(dir, `${s.id}.md`), s.content + '\n')
    }
    lines.push('---', '')
    fs.writeFileSync(path.join(dir, 'note.md'), lines.join('\n'))
  }
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

async function launchApp(opts, lang, { settings = {}, uiState = {}, extraSections = {}, files = {}, size = { width: 960, height: 600 } } = {}) {
  const { _electron } = require(path.join(REPO, 'node_modules', 'playwright'))
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-whatsnew-'))
  const profile = path.join(tmpRoot, 'profile')
  const notes = path.join(tmpRoot, 'notes')
  fs.mkdirSync(profile); fs.mkdirSync(notes)
  seedNotes(notes, lang, extraSections)
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(notes, name), content)
  seedProfile(profile, lang, { settings, uiState })
  const exe = process.platform === 'win32'
    ? path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe')
    : require(path.join(REPO, 'node_modules', 'electron'))
  const app = await _electron.launch({
    executablePath: exe,
    args: [opts.app, `--user-data-dir=${profile}`, `--force-device-scale-factor=${opts.scale}`,
      '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    cwd: opts.app,
    env: launchEnv(notes),
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await setMainBounds(app, { x: 60, y: 60, ...size })
  // No red squiggles under demo text.
  await app.evaluate(({ session }) => session.defaultSession.setSpellCheckerEnabled(false))
  await page.waitForTimeout(1800)
  const ctx = { app, page, tmpRoot, notes, profile, lang, size }
  return ctx
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
const OVERLAY_SRC = () => {
  if (window.__nfo) return
  const root = document.createElement('div')
  root.id = '__nf_capture_overlay'
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
  const style = document.createElement('style')
  style.textContent = `
    #__nf_cursor{position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.95) 0 4px,rgba(255,255,255,.35) 5px,rgba(255,255,255,.14) 12px,rgba(255,255,255,0) 13px);
      box-shadow:0 0 0 1.5px rgba(255,255,255,.55),0 2px 10px rgba(0,0,0,.45);opacity:0;transition:opacity .25s;will-change:transform}
    #__nf_cursor.on{opacity:1}
    .__nf_pulse{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid rgba(255,255,255,.85);
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
    keys(list, ms) {
      keys.innerHTML = list.map((k, i) => (i ? '<span>+</span>' : '') + `<kbd>${k}</kbd>`).join('')
      keys.classList.add('on')
      clearTimeout(state.keysTimer)
      state.keysTimer = setTimeout(() => keys.classList.remove('on'), ms || 1300)
    },
  }
}

async function injectOverlay(page) { await page.evaluate(OVERLAY_SRC) }

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

// Extracts sample frames of a finished clip for visual review.
function sampleFrames(webm, dir, n = 4) {
  fs.mkdirSync(dir, { recursive: true })
  const dur = probeDuration(webm)
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (dur * (i + 0.5)) / n
    const file = path.join(dir, `${path.basename(webm, '.webm')}-${i}.png`)
    ffmpeg(['-ss', t.toFixed(3), '-i', webm, '-frames:v', '1', file])
    out.push(file)
  }
  return out
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

const focusEditorEnd = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
  el.editor.commands.focus('end')
})

// Caret at the end of the last task item, so Enter starts a new task.
const focusLastTask = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('.ProseMirror')].find((e) => e.editor)
  const items = el.querySelectorAll('li[data-type="taskItem"] p')
  const target = items[items.length - 1]
  const pos = el.editor.view.posAtDOM(target, target.childNodes.length)
  el.editor.chain().focus().setTextSelection(pos).run()
})

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

// Wall-clock instant of a take → time in the encoded clip (after cuts and speed-up).
function clipTime(ts, t0, cuts, speed) {
  let t = ts - t0
  for (const [c0, c1] of cuts) if (c0 < ts) t -= Math.min(ts, c1) - c0
  return Math.max(0, t / speed)
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
