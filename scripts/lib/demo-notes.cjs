// ─────────────────────────────────────────────────────────────────────────────
// demo-notes.cjs — the demo notebook (EN/ES) used by the video capture scripts, and the
// seeder that writes it as v2 note folders straight into a throwaway notes dir. Never seed
// through the NoteFlow CLI: NOTEFLOW_NOTES_DIR does not isolate its NoteFlow Cloud session.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs')
const path = require('path')

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
// `extraSections` = { noteId: [section…] } appended to those notes; `tweak(content)` may edit the
// demo notebook in place before it is written (e.g. folder icons, favourites).
function seedNotes(notesDir, lang, extraSections = {}, tweak = null) {
  const content = demoContent(lang)
  const { groups, folders, notes } = content
  for (const n of notes) if (extraSections[n.id]) n.sections.push(...extraSections[n.id])
  if (tweak) tweak(content)
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
module.exports = { ID, demoContent, noteDirname, seedNotes }
