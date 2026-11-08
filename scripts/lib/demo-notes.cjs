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
  // Group + folders of the fuller notebook (`{ full: true }`).
  gBusiness: 'grpbusi1', fMarketing: 'fldmkt01', fClients: 'fldcli01', fMeetings: 'fldmeet1', fHealth: 'fldhlth1', fHome: 'fldhome1', fCourses: 'fldcrse1',
}

// Extra notes of the fuller notebook (opt-in: `demoContent(lang, { full: true })`), so the brain
// view looks full with many cross-links. They go into the Engineering folder, the Personal /
// Learning groups or a 4th group (Business, last in the list), so the Work group of the sidebar
// keeps the same rows (only Engineering's count grows) and collapsing Personal / Learning /
// Business / Engineering hides them all. `rel` / `S` / `L` come from demoContent.
function fullNotebook(L, rel, S) {
  const group = { id: ID.gBusiness, name: L('Business', 'Negocio'), color: '--orange', order: 3 }
  const folders = [
    { id: ID.fMarketing, name: L('Marketing', 'Marketing'), groupId: ID.gBusiness, order: 0 },
    { id: ID.fClients, name: L('Clients', 'Clientes'), groupId: ID.gBusiness, order: 1 },
    { id: ID.fMeetings, name: L('Meetings', 'Reuniones'), groupId: ID.gBusiness, order: 2 },
    { id: ID.fHealth, name: L('Health', 'Salud'), groupId: ID.gPersonal, order: 0 },
    { id: ID.fHome, name: L('Home', 'Casa'), groupId: ID.gPersonal, order: 1 },
    { id: ID.fCourses, name: L('Courses', 'Cursos'), groupId: ID.gLearn, order: 0 },
  ]
  // [id, title, group, folder, daysAgo, [[secId, name, content], …]]
  const W = ID.gWork, B = ID.gBusiness, P = ID.gPersonal, LE = ID.gLearn
  const raw = [
    // ── Work · Engineering ──
    ['nincid01', L('Incident postmortem', 'Postmortem del incidente'), W, ID.fEng, 7, [
      ['sinctl', L('Timeline', 'Cronología'), L(`- **09:12** — login errors spike after the deploy\n- **09:20** — rollback started\n- **09:31** — all green\n\nRoot cause in ${rel(S.auth, ID.api, 'sauthx')}.`, `- **09:12** — se disparan los errores de login tras el despliegue\n- **09:20** — empieza el rollback\n- **09:31** — todo en verde\n\nCausa raíz en ${rel(S.auth, ID.api, 'sauthx')}.`)],
      ['sincac', L('Action items', 'Acciones'), L(`- [x] Add a canary step to ${rel('Production', 'ndeploy1', 'sdepro')}\n- [ ] Alert on token refresh failures`, `- [x] Añadir un paso canary a ${rel('Producción', 'ndeploy1', 'sdepro')}\n- [ ] Alerta si fallan los refresh de tokens`)],
    ]],
    ['ndeploy1', L('Deploy checklist', 'Checklist de despliegue'), W, ID.fEng, 11, [
      ['sdesta', L('Staging', 'Staging'), L(`- [x] Migrations dry-run\n- [x] Smoke tests\n- [ ] Check ${rel(S.endpoints, ID.api, 'sendpt')}`, `- [x] Migraciones en seco\n- [x] Smoke tests\n- [ ] Revisar ${rel(S.endpoints, ID.api, 'sendpt')}`)],
      ['sdepro', L('Production', 'Producción'), L('- Canary to 5% for 30 min\n- Watch error rate and p95 latency\n- Full rollout', '- Canary al 5% durante 30 min\n- Vigilar tasa de errores y latencia p95\n- Despliegue completo')],
    ]],
    ['nperf001', L('Performance budget', 'Presupuesto de rendimiento'), W, ID.fEng, 16, [
      ['sperft', L('Targets', 'Objetivos'), L('- First load **< 1.5 s**\n- Search results **< 100 ms**\n- Bundle **< 300 KB** gzip', '- Primera carga **< 1,5 s**\n- Resultados de búsqueda **< 100 ms**\n- Bundle **< 300 KB** gzip')],
      ['sperff', L('Findings', 'Hallazgos'), L(`- The data table re-renders on every keystroke (${rel(S.components, ID.design, 'scompo')})\n- Lazy-load the charts`, `- La tabla de datos se repinta en cada tecla (${rel(S.components, ID.design, 'scompo')})\n- Cargar los gráficos bajo demanda`)],
    ]],
    ['narch001', L('Architecture decisions', 'Decisiones de arquitectura'), W, ID.fEng, 30, [
      ['sadr01', 'ADR-001 Postgres', L(`Postgres for everything until it hurts. Feeds ${rel(S.endpoints, ID.api, 'sendpt')}.`, `Postgres para todo hasta que duela. Alimenta ${rel(S.endpoints, ID.api, 'sendpt')}.`)],
      ['sadr02', L('ADR-002 Job queue', 'ADR-002 Cola de trabajos'), L(`Background jobs on a queue table; revisit with ${rel(L('Targets', 'Objetivos'), 'nperf001', 'sperft')}.`, `Trabajos en segundo plano en una tabla-cola; revisar con ${rel(L('Targets', 'Objetivos'), 'nperf001', 'sperft')}.`)],
    ]],
    ['noncall1', L('On-call runbook', 'Runbook de guardias'), W, ID.fEng, 22, [
      ['soncal', L('Alerts', 'Alertas'), L(`- **5xx > 2%** — check the last deploy (${rel(L('Production', 'Producción'), 'ndeploy1', 'sdepro')})\n- **Queue lag** — scale the workers`, `- **5xx > 2%** — revisar el último despliegue (${rel(L('Production', 'Producción'), 'ndeploy1', 'sdepro')})\n- **Retraso en la cola** — escalar los workers`)],
      ['sonesc', L('Escalation', 'Escalado'), L(`Primary → secondary after 15 min. Past incidents: ${rel(L('Timeline', 'Cronología'), 'nincid01', 'sinctl')}.`, `Primaria → secundaria a los 15 min. Incidentes previos: ${rel(L('Timeline', 'Cronología'), 'nincid01', 'sinctl')}.`)],
    ]],
    ['ncodrev1', L('Code review guide', 'Guía de code review'), W, ID.fEng, 40, [
      ['scodch', L('Checklist', 'Checklist'), L(`- Small PRs, one idea each\n- Tests for every bug fix\n- Follow ${rel('ADR-001 Postgres', 'narch001', 'sadr01')}`, `- PRs pequeñas, una idea cada una\n- Tests para cada bug\n- Seguir ${rel('ADR-001 Postgres', 'narch001', 'sadr01')}`)],
    ]],
    ['nmigrat1', L('Database migration', 'Migración de base de datos'), W, ID.fEng, 13, [
      ['smigpl', L('Plan', 'Plan'), L(`1. Add the new columns\n2. Backfill in batches\n3. Switch reads — see ${rel(L('Staging', 'Staging'), 'ndeploy1', 'sdesta')}`, `1. Añadir las columnas nuevas\n2. Rellenar por lotes\n3. Cambiar las lecturas — ver ${rel('Staging', 'ndeploy1', 'sdesta')}`)],
      ['smigrb', L('Rollback', 'Rollback'), L('Keep the old columns for two releases. `DROP` only after a clean week.', 'Mantener las columnas viejas dos versiones. `DROP` solo tras una semana limpia.')],
    ]],
    // ── Business · Marketing ──
    ['nblog001', L('Blog post ideas', 'Ideas para el blog'), B, ID.fMarketing, 5, [
      ['sbldra', L('Drafts', 'Borradores'), L(`- Why we went local-first (${rel(S.ownership, ID.ideas, 'sownsh')})\n- What 8 user interviews taught us (${rel(S.insights, ID.research, 'sinsig')})`, `- Por qué apostamos por local-first (${rel(S.ownership, ID.ideas, 'sownsh')})\n- Lo que aprendimos en 8 entrevistas (${rel(S.insights, ID.research, 'sinsig')})`)],
      ['sblpub', L('Published', 'Publicados'), L('- Introducing the public beta\n- Keyboard-first, on purpose', '- Presentamos la beta pública\n- Teclado primero, a propósito')],
    ]],
    ['nnewsl01', L('Newsletter', 'Newsletter'), B, ID.fMarketing, 9, [
      ['snewoc', L('October issue', 'Número de octubre'), L(`- Lead: the beta waves (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Tip of the month: section links\n- From the blog: ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}`, `- Portada: las oleadas de la beta (${rel(S.roadmap, ID.launch, 'sroadm')})\n- Truco del mes: enlaces entre secciones\n- Del blog: ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}`)],
    ]],
    ['nsocial1', L('Social calendar', 'Calendario de redes'), B, ID.fMarketing, 3, [
      ['ssocwk', L('This week', 'Esta semana'), L(`- **Mon** — teaser clip\n- **Wed** — thread on ${rel(L('Published', 'Publicados'), 'nblog001', 'sblpub')}\n- **Fri** — beta sign-up reminder`, `- **Lun** — clip teaser\n- **Mié** — hilo sobre ${rel(L('Published', 'Publicados'), 'nblog001', 'sblpub')}\n- **Vie** — recordatorio de la beta`)],
    ]],
    ['nseo0001', L('SEO keywords', 'Palabras clave SEO'), B, ID.fMarketing, 27, [
      ['sseokw', L('Keywords', 'Palabras clave'), L(`- markdown notes app\n- offline note taking\n- second brain — angle for ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}`, `- app de notas markdown\n- notas sin conexión\n- segundo cerebro — enfoque para ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}`)],
    ]],
    ['ncompet1', L('Competitor notes', 'Análisis de competidores'), B, ID.fMarketing, 19, [
      ['scomp1', L('Landscape', 'Panorama'), L(`- Big all-in-one workspaces: powerful, slow to capture\n- Plain-text apps: fast, few structure tools\n- Our gap: **fast capture + sections** (${rel(S.insights, ID.research, 'sinsig')})`, `- Espacios todo-en-uno: potentes, lentos para capturar\n- Apps de texto plano: rápidas, poca estructura\n- Nuestro hueco: **captura rápida + secciones** (${rel(S.insights, ID.research, 'sinsig')})`)],
    ]],
    ['npricin1', L('Pricing page', 'Página de precios'), B, ID.fMarketing, 6, [
      ['sprtie', L('Tiers', 'Planes'), L(`- **Free** — everything local\n- **Pro** — sync + AI\n- **Team** — shared spaces\n\nDecided in ${rel(S.meeting, ID.launch, 'smeetn')}.`, `- **Gratis** — todo en local\n- **Pro** — sync + IA\n- **Equipo** — espacios compartidos\n\nDecidido en ${rel(S.meeting, ID.launch, 'smeetn')}.`)],
      ['sprcmp', L('Comparison', 'Comparativa'), L(`Table vs. ${rel(L('Landscape', 'Panorama'), 'ncompet1', 'scomp1')}.`, `Tabla frente a ${rel(L('Landscape', 'Panorama'), 'ncompet1', 'scomp1')}.`)],
    ]],
    // ── Business · Clients ──
    ['nacme001', L('Acme Corp', 'Acme Corp'), B, ID.fClients, 4, [
      ['sacmec', L('Contacts', 'Contactos'), L('- Laura — Head of Ops\n- Tom — IT, owns the SSO setup', '- Laura — directora de operaciones\n- Tom — IT, lleva el SSO')],
      ['sacmen', L('Next steps', 'Próximos pasos'), L(`- [ ] Send the ${rel(L('Tiers', 'Planes'), 'npricin1', 'sprtie')} proposal\n- [ ] Pilot with 20 seats`, `- [ ] Enviar la propuesta de ${rel(L('Tiers', 'Planes'), 'npricin1', 'sprtie')}\n- [ ] Piloto con 20 licencias`)],
    ]],
    ['nglobex1', L('Globex onboarding', 'Onboarding de Globex'), B, ID.fClients, 8, [
      ['sglokc', L('Kick-off', 'Kick-off'), L(`- SSO first (${rel(S.auth, ID.api, 'sauthx')})\n- Import from their old wiki`, `- Primero el SSO (${rel(S.auth, ID.api, 'sauthx')})\n- Importar desde su wiki antigua`)],
      ['sglota', L('Tasks', 'Tareas'), L('- [x] Workspace created\n- [ ] Training session\n- [ ] Check-in after 30 days', '- [x] Espacio creado\n- [ ] Sesión de formación\n- [ ] Revisión a los 30 días')],
    ]],
    ['ninitec1', L('Initech renewal', 'Renovación de Initech'), B, ID.fClients, 14, [
      ['sinist', L('Status', 'Estado'), L(`Renewal due in December. Usage up 30% (${rel(S.metrics, ID.okrs, 'smetri')}).`, `Renovación en diciembre. Uso +30% (${rel(S.metrics, ID.okrs, 'smetri')}).`)],
    ]],
    ['nsupprt1', L('Support tickets', 'Tickets de soporte'), B, ID.fClients, 2, [
      ['ssupop', L('Open', 'Abiertos'), L('- #482 — import stuck at 90%\n- #487 — dark mode contrast in tables', '- #482 — importación atascada al 90%\n- #487 — contraste de tablas en modo oscuro')],
      ['ssuppa', L('Patterns', 'Patrones'), L(`- Login issues trace back to ${rel(L('Timeline', 'Cronología'), 'nincid01', 'sinctl')}\n- People ask for offline mode (${rel(S.interviews, ID.research, 'sinter')})`, `- Los problemas de login vienen de ${rel(L('Timeline', 'Cronología'), 'nincid01', 'sinctl')}\n- Piden modo offline (${rel(S.interviews, ID.research, 'sinter')})`)],
    ]],
    // ── Business · Meetings ──
    ['n1on1an1', L('1:1 with Ana', '1:1 con Ana'), B, ID.fMeetings, 1, [
      ['s1oag1', L('Agenda', 'Agenda'), L(`- Onboarding feedback (${rel(S.candidates, ID.hiring, 'scandi')})\n- Table component ownership`, `- Feedback del onboarding (${rel(S.candidates, ID.hiring, 'scandi')})\n- Responsable del componente de tabla`)],
      ['s1ono1', L('Notes', 'Notas'), L('- Wants to lead the accessibility audit\n- Pair on the data table next week', '- Quiere liderar la auditoría de accesibilidad\n- Pairing en la tabla de datos la semana que viene')],
    ]],
    ['nallhan1', L('All-hands — October', 'All-hands de octubre'), B, ID.fMeetings, 12, [
      ['sallag', L('Agenda', 'Agenda'), L(`1. ${rel(S.q4, ID.okrs, 'sq4gol')}\n2. Launch timeline — ${rel(S.roadmap, ID.launch, 'sroadm')}\n3. Q&A`, `1. ${rel(S.q4, ID.okrs, 'sq4gol')}\n2. Calendario del lanzamiento — ${rel(S.roadmap, ID.launch, 'sroadm')}\n3. Preguntas`)],
    ]],
    ['nretro01', L('Sprint retro', 'Retro del sprint'), B, ID.fMeetings, 6, [
      ['sretwe', L('Went well', 'Fue bien'), L(`- Zero-downtime deploys (${rel(L('Production', 'Producción'), 'ndeploy1', 'sdepro')})\n- Faster standups`, `- Despliegues sin cortes (${rel(L('Production', 'Producción'), 'ndeploy1', 'sdepro')})\n- Dailies más cortas`)],
      ['sretim', L('To improve', 'A mejorar'), L(`- Too much work in progress\n- Flaky e2e tests — see ${rel(S.standup, ID.standup, 'sstand')}`, `- Demasiado trabajo en curso\n- Tests e2e inestables — ver ${rel(S.standup, ID.standup, 'sstand')}`)],
    ]],
    ['nplann01', L('Sprint planning', 'Planificación del sprint'), B, ID.fMeetings, 5, [
      ['splans', L('Sprint 15', 'Sprint 15'), L(`- Answer ${rel(S.openq, ID.api, 'sopenq')}\n- Finish ${rel(S.components, ID.design, 'scompo')}\n- Carry-over from ${rel(L('To improve', 'A mejorar'), 'nretro01', 'sretim')}`, `- Responder ${rel(S.openq, ID.api, 'sopenq')}\n- Terminar ${rel(S.components, ID.design, 'scompo')}\n- Pendiente de ${rel(L('To improve', 'A mejorar'), 'nretro01', 'sretim')}`)],
    ]],
    // ── Personal ──
    ['nrunpl01', L('Half marathon plan', 'Plan de media maratón'), P, ID.fHealth, 9, [
      ['srunwk', L('Weeks 1–4', 'Semanas 1–4'), L(`- 3 easy runs + 1 long run\n- Long run: 10 → 14 km\n- Logged in ${rel(S.habits, ID.habits, 'shabit')}`, `- 3 rodajes suaves + 1 tirada larga\n- Tirada larga: 10 → 14 km\n- Apuntado en ${rel(S.habits, ID.habits, 'shabit')}`)],
      ['srunrd', L('Race day', 'Día de la carrera'), L('- Target pace **5:20/km**\n- Gel at km 8 and 15', '- Ritmo objetivo **5:20/km**\n- Gel en el km 8 y el 15')],
    ]],
    ['nmeals01', L('Meal prep', 'Batch cooking'), P, ID.fHealth, 7, [
      ['smeals', L('Sunday', 'Domingo'), L(`- Roast vegetables + quinoa\n- Two dinners from ${rel(S.weeknight, ID.recipes, 'swknit')}\n- Fuel for ${rel(L('Weeks 1–4', 'Semanas 1–4'), 'nrunpl01', 'srunwk')}`, `- Verduras asadas + quinoa\n- Dos cenas de ${rel(S.weeknight, ID.recipes, 'swknit')}\n- Energía para ${rel(L('Weeks 1–4', 'Semanas 1–4'), 'nrunpl01', 'srunwk')}`)],
    ]],
    ['nsleep01', L('Sleep log', 'Registro de sueño'), P, ID.fHealth, 1, [
      ['ssleep', L('This week', 'Esta semana'), L(`- Avg **7 h 10 min**\n- Better on days with ${rel(S.habits, ID.habits, 'shabit')} done`, `- Media **7 h 10 min**\n- Mejor los días con ${rel(S.habits, ID.habits, 'shabit')} hecho`)],
    ]],
    ['nmovin01', L('Moving checklist', 'Mudanza'), P, ID.fHome, 21, [
      ['smovbf', L('Before', 'Antes'), L('- [x] Book the van\n- [ ] Change address at the bank\n- [ ] Boxes for the books', '- [x] Reservar la furgoneta\n- [ ] Cambiar la dirección en el banco\n- [ ] Cajas para los libros')],
      ['smovdy', L('Moving day', 'Día de la mudanza'), L(`- Keys at 9:00\n- Budget in ${rel(L('November', 'Noviembre'), 'nbudget1', 'sbudno')}`, `- Llaves a las 9:00\n- Presupuesto en ${rel(L('November', 'Noviembre'), 'nbudget1', 'sbudno')}`)],
    ]],
    ['nbudget1', L('Monthly budget', 'Presupuesto mensual'), P, ID.fHome, 3, [
      ['sbudno', L('November', 'Noviembre'), L(`- Rent, utilities\n- Savings: 20%\n- Trips: ${rel(S.itinerary, ID.lisbon, 'sitine')}`, `- Alquiler, suministros\n- Ahorro: 20%\n- Viajes: ${rel(S.itinerary, ID.lisbon, 'sitine')}`)],
    ]],
    ['nplant01', L('Plant care', 'Cuidado de plantas'), P, ID.fHome, 17, [
      ['splant', L('Watering', 'Riego'), L('- Monstera — weekly\n- Snake plant — every two weeks\n- Basil — daily in summer', '- Monstera — cada semana\n- Sansevieria — cada dos semanas\n- Albahaca — a diario en verano')],
    ]],
    ['ngifts01', L('Gift ideas', 'Ideas de regalos'), P, null, 24, [
      ['sgifts', L('Family', 'Familia'), L(`- Mum — a book from ${rel(S.books, ID.reading, 'sbooks')}\n- Leo — climbing lessons`, `- Mamá — un libro de ${rel(S.books, ID.reading, 'sbooks')}\n- Leo — clases de escalada`)],
    ]],
    ['nkyoto01', L('Trip to Kyoto', 'Viaje a Kioto'), P, null, 28, [
      ['skyoid', L('Ideas', 'Ideas'), L(`- Fushimi Inari at sunrise\n- Philosopher's Path\n- Pack like ${rel(S.packing, ID.lisbon, 'spacki')}`, `- Fushimi Inari al amanecer\n- Camino del Filósofo\n- Equipaje como en ${rel(S.packing, ID.lisbon, 'spacki')}`)],
      ['skyobu', L('Budget', 'Presupuesto'), L(`Flights + 6 nights. Saving in ${rel(L('November', 'Noviembre'), 'nbudget1', 'sbudno')}.`, `Vuelos + 6 noches. Ahorro en ${rel(L('November', 'Noviembre'), 'nbudget1', 'sbudno')}.`)],
    ]],
    // ── Learning ──
    ['nsysde01', L('System design course', 'Curso de diseño de sistemas'), LE, ID.fCourses, 10, [
      ['ssycac', L('Caching', 'Caché'), L(`- Cache-aside vs write-through\n- Applied in ${rel(L('Targets', 'Objetivos'), 'nperf001', 'sperft')}`, `- Cache-aside frente a write-through\n- Aplicado en ${rel(L('Targets', 'Objetivos'), 'nperf001', 'sperft')}`)],
      ['ssyque', L('Queues', 'Colas'), L(`At-least-once delivery, idempotent consumers. Compare ${rel(L('ADR-002 Job queue', 'ADR-002 Cola de trabajos'), 'narch001', 'sadr02')}.`, `Entrega al menos una vez, consumidores idempotentes. Comparar con ${rel(L('ADR-002 Job queue', 'ADR-002 Cola de trabajos'), 'narch001', 'sadr02')}.`)],
    ]],
    ['nmlbas01', L('ML basics', 'Fundamentos de ML'), LE, ID.fCourses, 15, [
      ['smlemb', L('Embeddings', 'Embeddings'), L(`Text → vectors; similar meaning, nearby vectors. Idea for ${rel(S.inbox, ID.ideas, 'sinbox')}.`, `Texto → vectores; significado parecido, vectores cercanos. Idea para ${rel(S.inbox, ID.ideas, 'sinbox')}.`)],
      ['smlnot', L('Notes', 'Apuntes'), L(`- Cosine similarity\n- Train/test split\n- Ties into ${rel(L('Queues', 'Colas'), 'nsysde01', 'ssyque')}`, `- Similitud del coseno\n- División train/test\n- Conecta con ${rel(L('Queues', 'Colas'), 'nsysde01', 'ssyque')}`)],
    ]],
    ['njapan01', L('Japanese practice', 'Práctica de japonés'), LE, ID.fCourses, 2, [
      ['sjapvo', L('Vocabulary', 'Vocabulario'), L(`- 駅 (eki) — station\n- 切符 (kippu) — ticket\n- For ${rel(L('Ideas', 'Ideas'), 'nkyoto01', 'skyoid')}`, `- 駅 (eki) — estación\n- 切符 (kippu) — billete\n- Para ${rel(L('Ideas', 'Ideas'), 'nkyoto01', 'skyoid')}`)],
    ]],
    ['ntalks01', L('Conference talks', 'Charlas de conferencias'), LE, null, 12, [
      ['stalkw', L('To watch', 'Por ver'), L(`- Local-first in practice (${rel(S.articles, ID.reading, 'sartic')})\n- Rust at scale (${rel(S.ownership, ID.rust, 'srust1')})`, `- Local-first en la práctica (${rel(S.articles, ID.reading, 'sartic')})\n- Rust a escala (${rel(S.ownership, ID.rust, 'srust1')})`)],
    ]],
    ['npodca01', L('Podcast notes', 'Notas de podcasts'), LE, null, 6, [
      ['spodep', L('Episodes', 'Episodios'), L(`- On deep work: protect two hours a day\n- On writing: ${rel(S.inbox, ID.ideas, 'sinbox')}`, `- Sobre trabajo profundo: proteger dos horas al día\n- Sobre escribir: ${rel(S.inbox, ID.ideas, 'sinbox')}`)],
    ]],
    ['nwrite01', L('Writing practice', 'Escritura'), LE, null, 20, [
      ['swripr', L('Prompts', 'Ideas'), L(`- 300 words a day\n- Turn one into ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}\n- Theme: ${rel(S.ownership, ID.ideas, 'sownsh')}`, `- 300 palabras al día\n- Convertir una en ${rel(L('Drafts', 'Borradores'), 'nblog001', 'sbldra')}\n- Tema: ${rel(S.ownership, ID.ideas, 'sownsh')}`)],
    ]],
    ['nshort01', L('Shortcuts cheat sheet', 'Chuleta de atajos'), LE, null, 35, [
      ['sshort', L('Editor', 'Editor'), L('- `Ctrl+T` new section\n- `Ctrl+Tab` next section\n- `Ctrl+P` jump anywhere\n- `/` commands and snippets', '- `Ctrl+T` nueva sección\n- `Ctrl+Tab` siguiente sección\n- `Ctrl+P` saltar a cualquier sitio\n- `/` comandos y fragmentos')],
    ]],
  ]
  const notes = raw.map(([id, title, group, folder, daysAgo, secs]) => ({
    id, title, group, ...(folder ? { folder } : {}), daysAgo,
    sections: secs.map(([sid, name, content]) => ({ id: sid, name, content })),
  }))
  return { group, folders, notes }
}

function demoContent(lang, { full = false } = {}) {
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
  if (full) {
    const extra = fullNotebook(L, rel, S)
    groups.push(extra.group)
    folders.push(...extra.folders)
    notes.push(...extra.notes)
  }
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
// demo notebook in place before it is written (e.g. folder icons, favourites). `full: true` adds the
// fuller notebook (~50 notes, many cross-links) for a busy brain view.
function seedNotes(notesDir, lang, extraSections = {}, tweak = null, { full = false } = {}) {
  const content = demoContent(lang, { full })
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
