// Structural reference data for the /cli page — mirrors the NoteFlow CLI v2.7.0.
// Language-neutral fields (usage, flags, examples, colour tokens) live here once;
// the short bilingual descriptions are inline per row (the table is ~30 rows with
// 80% identical structure — two mirror files would drift apart).
// Long-form prose for the page sections lives in src/i18n/docs/cli.{en,es}.ts.

export interface L10n {
  en: string;
  es: string;
}

export interface CliFlag {
  flag: string;
  desc: L10n;
}

export interface CliCommand {
  id: string;
  usage: string;
  desc: L10n;
  flags?: CliFlag[];
  example?: string[];
  /** brain-site.css rgb-triple token used to tint the usage cell (inherited from the group). */
  tok: string;
}

export interface CliGroup {
  id: string;
  label: L10n;
  tok: string;
  commands: CliCommand[];
}

const g = (tok: string, cmds: Omit<CliCommand, 'tok'>[]): CliCommand[] =>
  cmds.map((c) => ({ ...c, tok }));

export const cliGroups: CliGroup[] = [
  {
    id: 'notes',
    label: { en: 'Notes', es: 'Notas' },
    tok: 'cyan',
    commands: g('cyan', [
      {
        id: 'add',
        usage: 'noteflow add <text> [options]',
        desc: {
          en: 'Append text to today’s daily note (title <code>DD-MM-YYYY</code>, created if it doesn’t exist) — or to any note via <code>--title</code>, which must exist unless you pass <code>--create</code>. The text is appended to the end of the section, separated by a newline.',
          es: 'Añade texto a la nota diaria de hoy (título <code>DD-MM-YYYY</code>, se crea si no existe) — o a cualquier nota con <code>--title</code>, que debe existir salvo que pases <code>--create</code>. El texto se añade al final de la sección, separado por un salto de línea.',
        },
        flags: [
          { flag: '--title <title>', desc: { en: 'Write into the note with that title instead of today’s. The exact title wins; a partial one works if it matches a single note — several matches are an error that lists them.', es: 'Escribe en la nota con ese título en vez de la del día. El título exacto gana; uno parcial vale si solo coincide con una nota — con varias es un error que las lista.' } },
          { flag: '--section <name>', desc: { en: 'Target section/tab, matched by its <strong>exact</strong> name (case-insensitive) — never a partial match. An unknown name is an error that suggests similar sections and lists the existing ones (also as JSON with <code>--json</code>), so a typo never creates a stray section. Default: <code>Note</code>, created if missing.', es: 'Sección/pestaña destino, por su nombre <strong>exacto</strong> (sin distinguir mayúsculas) — nunca por coincidencia parcial. Un nombre que no existe es un error que sugiere las secciones parecidas y lista las existentes (también en JSON con <code>--json</code>), así un typo nunca crea una sección basura. Default: <code>Note</code>, que se crea si falta.' } },
          { flag: '--create', desc: { en: 'Create whatever is missing: the <code>--title</code> note and/or the <code>--section</code>.', es: 'Crea lo que falte: la nota de <code>--title</code> y/o la sección de <code>--section</code>.' } },
          { flag: '--tag <tag>', desc: { en: 'Add this tag to the note (if it doesn’t have it yet).', es: 'Añade este tag a la nota (si no lo tiene ya).' } },
          { flag: '--group <name>', desc: { en: 'Assign the note to a group (an existing note moves to it, to the group root unless <code>--folder</code>). An unknown group is an error — nothing is written.', es: 'Asigna la nota a un grupo (una nota existente se mueve a él, a su raíz salvo <code>--folder</code>). Un grupo que no existe es un error — no se escribe nada.' } },
          { flag: '--folder <name>', desc: { en: 'Place the note in a folder of that group (requires <code>--group</code>; an unknown folder is an error).', es: 'Coloca la nota en una carpeta de ese grupo (requiere <code>--group</code>; una carpeta que no existe es un error).' } },
          { flag: '--raw', desc: { en: 'Create a new section in text mode, shown as-is (default: markdown mode, rendered; <code>--markdown</code>/<code>--rich</code> say so explicitly).', es: 'Crea la sección nueva en modo texto, tal cual (default: modo markdown, renderizado; <code>--markdown</code>/<code>--rich</code> lo explicitan).' } },
        ],
        example: ['$ noteflow add "Fix: CORS on /api/notes"', '$ noteflow add "Check server logs" --section Tasks --create --tag urgent'],
      },
      {
        id: 'new',
        usage: 'noteflow new <title> [options]',
        desc: {
          en: 'Create an empty note.',
          es: 'Crea una nota vacía.',
        },
        flags: [
          { flag: '--section <name>', desc: { en: 'Name of the first section. Default: <code>Note</code>.', es: 'Nombre de la primera sección. Default: <code>Note</code>.' } },
          { flag: '--group <name>', desc: { en: 'Assign to a group.', es: 'Asignar a un grupo.' } },
          { flag: '--folder <name>', desc: { en: 'Place in a folder of that group (requires <code>--group</code>).', es: 'Colocar en una carpeta de ese grupo (requiere <code>--group</code>).' } },
          { flag: '--raw', desc: { en: 'First section in text mode (default: markdown mode).', es: 'Primera sección en modo texto (default: modo markdown).' } },
          { flag: '--json', desc: { en: 'Print <code>{ id, title, dirname }</code> as JSON.', es: 'Devuelve <code>{ id, title, dirname }</code> en JSON.' } },
        ],
        example: ['$ noteflow new "Sprint 14" --group backend --section Planning'],
      },
      {
        id: 'list',
        usage: 'noteflow list [options]',
        desc: {
          en: 'List notes sorted by <code>updated</code> desc. Archived notes are excluded by default.',
          es: 'Lista las notas ordenadas por <code>updated</code> desc. Excluye archivadas por defecto.',
        },
        flags: [
          { flag: '--tag <tag>', desc: { en: 'Filter by tag.', es: 'Filtrar por tag.' } },
          { flag: '--group <name>', desc: { en: 'Filter by group.', es: 'Filtrar por grupo.' } },
          { flag: '--folder <name>', desc: { en: 'Filter by folder (disambiguate with <code>--group</code> if the name repeats).', es: 'Filtrar por carpeta (desambigua con <code>--group</code> si el nombre se repite).' } },
          { flag: '--archived', desc: { en: 'Include archived notes.', es: 'Incluir notas archivadas.' } },
          { flag: '--json', desc: { en: 'JSON array with full metadata per note (id, title, tags, group, folder, dates, sections…).', es: 'Array JSON con la metadata completa de cada nota (id, title, tags, group, folder, fechas, sections…).' } },
        ],
        example: ['$ noteflow list --tag urgent --json'],
      },
      {
        id: 'get',
        usage: 'noteflow get <title> [options]',
        desc: {
          en: 'Pretty-print a note for humans (indented, decorated). The title can be partial — on multiple matches it lists them and asks for more precision. For piping or agents, use <code>read</code> instead.',
          es: 'Muestra una nota formateada para humanos (indentada, decorada). El título puede ser parcial — con varios matches muestra la lista y pide más precisión. Para pipes o agentes, usa <code>read</code>.',
        },
        flags: [
          { flag: '--section <name>', desc: { en: 'Show only that section.', es: 'Mostrar solo esa sección.' } },
          { flag: '--json', desc: { en: 'Full JSON with every section and its content.', es: 'JSON completo con todas las secciones y su contenido.' } },
        ],
      },
      {
        id: 'read',
        usage: 'noteflow read <title> [section]',
        desc: {
          en: 'Print content <strong>verbatim</strong> to stdout — no indentation, no decoration. The recommended way to read a section for pipes and agents. Duplicate section names are addressed with a 1-based suffix, e.g. <code>"Tasks#2"</code>.',
          es: 'Imprime el contenido <strong>tal cual</strong> en stdout — sin indentar ni decorar. La forma recomendada de leer una sección para pipes y agentes. Nombres de sección duplicados se direccionan con sufijo 1-based, p. ej. <code>"Tasks#2"</code>.',
        },
        flags: [
          { flag: '--section <name>', desc: { en: 'Flag form of the positional section (handy with multi-word titles).', es: 'Forma con flag de la sección posicional (útil con títulos multi-palabra).' } },
          { flag: '--json', desc: { en: 'JSON with every section (or just one if targeted).', es: 'JSON con todas las secciones (o solo una si se indica).' } },
        ],
        example: ['$ noteflow read "Project Alpha" Tasks', '$ noteflow read "Project Alpha" --json | jq \'.sections[].name\''],
      },
      {
        id: 'set',
        usage: 'noteflow set <title> <section> [source] [--create] [--raw]',
        desc: {
          en: '<strong>Replace</strong> a section’s content — the complement of <code>add</code>, which only appends. The recommended way to edit a section. The section is matched by its <strong>exact</strong> name (case-insensitive) — never partially, so <code>EN</code> can’t overwrite <code>Comentario</code>; with no exact match it fails, suggesting similar names and listing the existing ones (<code>--create</code> creates it instead). On ambiguous duplicate names without a <code>#n</code> suffix, it fails instead of guessing.',
          es: '<strong>Reemplaza</strong> el contenido de una sección — el complemento de <code>add</code>, que solo añade al final. La forma recomendada de editar una sección. La sección se busca por su nombre <strong>exacto</strong> (sin distinguir mayúsculas) — nunca parcial, así <code>EN</code> no puede pisar <code>Comentario</code>; sin match exacto falla, sugiriendo los nombres parecidos y listando los existentes (<code>--create</code> la crea en su lugar). Ante nombres duplicados ambiguos sin sufijo <code>#n</code>, falla en vez de adivinar.',
        },
        flags: [
          { flag: '--text "<content>"', desc: { en: 'Inline text (first source present wins).', es: 'Texto inline (gana la primera fuente presente).' } },
          { flag: '--file <path>', desc: { en: 'Read the content from a file — the most reliable route on Windows/PowerShell. UTF-8, or UTF-16 with a BOM (what PowerShell 5.1’s <code>&gt;</code> writes).', es: 'Lee el contenido de un archivo — la vía más fiable en Windows/PowerShell. UTF-8, o UTF-16 con BOM (lo que escribe el <code>&gt;</code> de PowerShell 5.1).' } },
          { flag: '--stdin', desc: { en: 'Read from stdin (also used automatically when piped).', es: 'Lee de stdin (también se usa automáticamente al recibir un pipe).' } },
          { flag: '--create', desc: { en: 'Create the section if it doesn’t exist.', es: 'Crea la sección si no existe.' } },
          { flag: '--raw', desc: { en: 'If the section is created, create it in text mode (default: markdown mode).', es: 'Si crea la sección, la crea en modo texto (default: modo markdown).' } },
        ],
        example: ['$ noteflow set "Project Alpha" Tasks --text "- [ ] deploy"', '$ cat todo.md | noteflow set "Project Alpha" Tasks --stdin'],
      },
      {
        id: 'path',
        usage: 'noteflow path <title> [section]',
        desc: {
          en: 'Print <strong>absolute paths</strong> verbatim: the section’s <code>.md</code> file, or the note’s directory when no section is given. Lets an agent or editor change a section <strong>in place</strong> — no <code>read</code>/<code>set</code> round-trip. Follow every edit with <code>touch</code>.',
          es: 'Imprime <strong>rutas absolutas</strong> tal cual: el <code>.md</code> de la sección, o el directorio de la nota si no se indica sección. Permite a un agente o editor cambiar una sección <strong>in situ</strong> — sin round-trip <code>read</code>/<code>set</code>. Cierra cada edición con <code>touch</code>.',
        },
        flags: [
          { flag: '--section <name>', desc: { en: 'Flag form of the positional section (handy with multi-word titles).', es: 'Forma con flag de la sección posicional (útil con títulos multi-palabra).' } },
          { flag: '--json', desc: { en: '<code>{ id, title, dir, noteFile, sections[] }</code> — or <code>{ id, title, dir, section, file, isRawMode }</code> when a section is given.', es: '<code>{ id, title, dir, noteFile, sections[] }</code> — o <code>{ id, title, dir, section, file, isRawMode }</code> si se indica sección.' } },
        ],
        example: ['$ noteflow path "Project Alpha" Tasks', '$ noteflow path "Project Alpha" --json | jq -r \'.sections[].file\''],
      },
      {
        id: 'touch',
        usage: 'noteflow touch <title>',
        desc: {
          en: 'Bump the note’s <code>updated:</code> timestamp and push it to the active sync backend — the counterpart of <code>path</code>, <strong>required after editing a section’s <code>.md</code> by hand</strong> (a raw file edit syncs nothing on its own). The note is re-read from disk first, so your edits are what travels.',
          es: 'Bumpea el <code>updated:</code> de la nota y la empuja al backend de sync activo — el complemento de <code>path</code>, <strong>obligatorio tras editar el <code>.md</code> de una sección a mano</strong> (editar el fichero no sincroniza nada por sí solo). La nota se relee de disco primero, así que viaja lo que editaste.',
        },
        example: ['$ noteflow touch "Project Alpha"'],
      },
      {
        id: 'delete',
        usage: 'noteflow delete <title> [--yes]',
        desc: {
          en: 'Delete a note (alias: <code>rm</code>). Asks for confirmation unless <code>--yes</code>. With sync active it also removes it from the GitHub repo.',
          es: 'Elimina una nota (alias: <code>rm</code>). Pide confirmación salvo con <code>--yes</code>. Con sync activo también la elimina del repositorio de GitHub.',
        },
      },
      {
        id: 'rename',
        usage: 'noteflow rename <current-title> <new-title>',
        desc: {
          en: 'Update the note’s <code>title</code> field. The folder name on disk doesn’t change (it contains the id).',
          es: 'Actualiza el campo <code>title</code> de la nota. El nombre de la carpeta en disco no cambia (contiene el id).',
        },
      },
      {
        id: 'favorite',
        usage: 'noteflow favorite <title>',
        desc: {
          en: 'Toggle the <code>favorited</code> flag (alias: <code>pin</code>). The desktop app shows favorites at the top of the list.',
          es: 'Alterna el campo <code>favorited</code> (alias: <code>pin</code>). La app de escritorio muestra las favoritas arriba de la lista.',
        },
      },
      {
        id: 'archive',
        usage: 'noteflow archive <title>',
        desc: {
          en: 'Toggle the <code>archived</code> state. Archived notes don’t show in <code>list</code> unless <code>--archived</code>.',
          es: 'Alterna el estado <code>archived</code>. Las archivadas no aparecen en <code>list</code> salvo con <code>--archived</code>.',
        },
      },
    ]),
  },
  {
    id: 'sections',
    label: { en: 'Sections', es: 'Secciones' },
    tok: 'purple',
    commands: g('purple', [
      {
        id: 'sections',
        usage: 'noteflow sections <title>',
        desc: {
          en: 'List a note’s sections with name, line count and mode (text/markdown). <code>section list</code> is an alias.',
          es: 'Lista las secciones de una nota con nombre, número de líneas y modo (texto/markdown). <code>section list</code> es un alias.',
        },
      },
      {
        id: 'section-add',
        usage: 'noteflow section add <title> <name> [--raw]',
        desc: {
          en: 'Create an empty section (markdown mode by default; <code>--raw</code> for text mode). Sections are managed by name — no ids needed.',
          es: 'Crea una sección vacía (modo markdown por defecto; <code>--raw</code> para modo texto). Las secciones se gestionan por nombre — sin ids.',
        },
        example: ['$ noteflow section add "Project Alpha" "Meeting Notes"'],
      },
      {
        id: 'section-rename',
        usage: 'noteflow section rename <title> <old> <new>',
        desc: {
          en: 'Rename a section (the file on disk doesn’t change — it’s addressed by id). Exact name only: with no exact match it fails and suggests similar ones.',
          es: 'Renombra una sección (el archivo en disco no cambia — va por id). Solo nombre exacto: sin match exacto falla y sugiere los parecidos.',
        },
      },
      {
        id: 'section-delete',
        usage: 'noteflow section delete <title> <name> [--yes]',
        desc: {
          en: 'Delete a section (confirmation unless <code>--yes</code>). <strong>Refuses to delete the last one.</strong> Exact name only — never a partial match. Disambiguate duplicates with <code>"Tasks#2"</code>.',
          es: 'Borra una sección (confirmación salvo <code>--yes</code>). <strong>Rechaza borrar la última.</strong> Solo nombre exacto — nunca por coincidencia parcial. Desambigua duplicados con <code>"Tasks#2"</code>.',
        },
      },
    ]),
  },
  {
    id: 'organize',
    label: { en: 'Organization', es: 'Organización' },
    tok: 'orange',
    commands: g('orange', [
      {
        id: 'move',
        usage: 'noteflow move <title> --group <g> [--folder <f>]',
        desc: {
          en: 'Move a note between groups and folders — the CLI equivalent of the app’s drag-and-drop. <code>--group</code> alone moves it to the group root (clearing the folder); <code>--ungroup</code> takes it out of both.',
          es: 'Mueve una nota entre grupos y carpetas — el equivalente CLI del drag-and-drop de la app. <code>--group</code> a secas la lleva a la raíz del grupo (limpia la carpeta); <code>--ungroup</code> la saca de ambos.',
        },
        example: ['$ noteflow move "Sprint 14" --group backend --folder Planning', '$ noteflow move "Sprint 14" --ungroup'],
      },
      {
        id: 'groups',
        usage: 'noteflow groups [--json]',
        desc: { en: 'List groups.', es: 'Lista los grupos.' },
      },
      {
        id: 'group-create',
        usage: 'noteflow group create <name> [--color <color>]',
        desc: {
          en: 'Create a group. Colors: <code>accent</code> (default), <code>accent-2</code>, <code>red</code>, <code>cyan</code>, <code>purple</code>, <code>text</code>, <code>orange</code>, <code>pink</code>.',
          es: 'Crea un grupo. Colores: <code>accent</code> (default), <code>accent-2</code>, <code>red</code>, <code>cyan</code>, <code>purple</code>, <code>text</code>, <code>orange</code>, <code>pink</code>.',
        },
        example: ['$ noteflow group create backend --color cyan'],
      },
      {
        id: 'group-delete',
        usage: 'noteflow group delete <name> [--yes]',
        desc: {
          en: 'Delete a group. Its notes are left ungrouped (not deleted). <strong>Its folders are deleted too</strong> — folders only exist inside a group.',
          es: 'Elimina un grupo. Sus notas quedan sin grupo (no se borran). <strong>Sus carpetas también se borran</strong> — las carpetas solo existen dentro de un grupo.',
        },
      },
      {
        id: 'folders',
        usage: 'noteflow folders [--group <g>] [--json]',
        desc: {
          en: 'List folders — all of them grouped by group, or only one group’s with <code>--group</code>.',
          es: 'Lista las carpetas — todas agrupadas por grupo, o solo las de uno con <code>--group</code>.',
        },
      },
      {
        id: 'folder-create',
        usage: 'noteflow folder create <name> --group <g>',
        desc: {
          en: 'Create a folder. <code>--group</code> is <strong>required</strong> — a folder can’t exist outside a group.',
          es: 'Crea una carpeta. <code>--group</code> es <strong>obligatorio</strong> — una carpeta no existe fuera de un grupo.',
        },
        example: ['$ noteflow folder create Planning --group backend'],
      },
      {
        id: 'folder-rename',
        usage: 'noteflow folder rename <name> <new-name> [--group <g>]',
        desc: {
          en: 'Rename a folder. Use <code>--group</code> to disambiguate if the name repeats across groups.',
          es: 'Renombra una carpeta. Usa <code>--group</code> para desambiguar si el nombre se repite entre grupos.',
        },
      },
      {
        id: 'folder-delete',
        usage: 'noteflow folder delete <name> [--group <g>] [--yes]',
        desc: {
          en: 'Delete a folder. Its notes <strong>fall to the group root</strong> (they keep the group, lose the folder) — nothing is deleted.',
          es: 'Elimina una carpeta. Sus notas <strong>caen a la raíz del grupo</strong> (conservan el grupo, pierden la carpeta) — no se borra ninguna.',
        },
      },
    ]),
  },
  {
    id: 'sync',
    label: { en: 'GitHub sync', es: 'Sync con GitHub' },
    tok: 'accent-2',
    commands: g('accent-2', [
      {
        id: 'login',
        usage: 'noteflow login [repo-name] [--no-pull] [--no-wait | --finish]',
        desc: {
          en: 'Connect to GitHub via Device Flow OAuth — it prints a code and a URL to authorize from any browser (perfect for headless boxes). Default repo: <code>noteflow-notes</code> — a bare name is a repo of whichever account you authorize with (created if missing); to connect an <strong>existing</strong> repo pass <code>owner/repo</code>, and authorizing with another account then fails without creating or saving anything. Once connected it <strong>pulls the repo’s notes automatically</strong> (local notes that are newer are kept), so a fresh machine is ready right away; <code>--no-pull</code> connects only. Skipped while NoteFlow Cloud is the active backend. The CLI keeps its own token, separate from the desktop app’s. For AI agents and scripts it also runs in two steps that never block: <code>--no-wait</code> prints the URL and code (<code>--json</code>: <code>{ verificationUri, userCode, expiresAt, repo }</code>) and exits; once you authorize, <code>--finish</code> completes the same login.',
          es: 'Conecta con GitHub vía Device Flow OAuth — muestra un código y una URL para autorizar desde cualquier navegador (ideal en headless). Repo por defecto: <code>noteflow-notes</code> — un nombre a secas es un repo de la cuenta con la que autorices (se crea si falta); para conectar un repo <strong>existente</strong> pasa <code>owner/repo</code>, y autorizar con otra cuenta falla entonces sin crear ni guardar nada. Al conectar <strong>baja automáticamente las notas del repo</strong> (se conservan las locales más recientes), así una máquina nueva queda lista al momento; <code>--no-pull</code> solo conecta. Se omite mientras NoteFlow Cloud es el backend activo. El CLI guarda su propio token, separado del de la app de escritorio. Para agentes de IA y scripts también va en dos pasos que nunca bloquean: <code>--no-wait</code> muestra la URL y el código (<code>--json</code>: <code>{ verificationUri, userCode, expiresAt, repo }</code>) y sale; cuando autorizas, <code>--finish</code> completa el mismo login.',
        },
        example: ['$ noteflow login --no-wait --json', '$ noteflow login --finish'],
      },
      {
        id: 'logout',
        usage: 'noteflow logout',
        desc: { en: 'Disconnect from GitHub.', es: 'Desconecta de GitHub.' },
      },
      {
        id: 'push',
        usage: 'noteflow push',
        desc: {
          en: 'Upload every note to the repo. A note that changed on GitHub since your last pull is never overwritten: it is merged <strong>line by line</strong> with the GitHub version and the result uploaded, no copy. Only if both sides changed the same lines are both versions kept in the note between ⚠️ markers (<code>Merged with conflicts: "…"</code>). Encrypted notes still keep yours as a conflict copy.',
          es: 'Sube todas las notas al repositorio. Una nota que cambió en GitHub desde tu último pull nunca se pisa: se fusiona <strong>línea a línea</strong> con la versión de GitHub y se sube el resultado, sin copia. Solo si los dos lados cambiaron las mismas líneas se guardan las dos versiones en la nota entre marcas ⚠️ (<code>Merged with conflicts: "…"</code>). Las notas cifradas siguen guardando la tuya como copia en conflicto.',
        },
      },
      {
        id: 'pull',
        usage: 'noteflow pull',
        desc: {
          en: 'Download notes from the repo (alias: <code>update</code>). Only overwrites a local note when the remote <code>updated</code> timestamp is newer.',
          es: 'Baja las notas del repo (alias: <code>update</code>). Solo sobreescribe una nota local cuando el <code>updated</code> remoto es más reciente.',
        },
      },
    ]),
  },
  {
    id: 'cloud',
    label: { en: 'NoteFlow Cloud', es: 'NoteFlow Cloud' },
    tok: 'accent',
    commands: g('accent', [
      {
        id: 'cloud-login',
        usage: 'noteflow cloud login [email] [--no-pull] [--send-code | --code <code>]',
        desc: {
          en: 'Sign in to your NoteFlow account with a one-time code sent to your email. The CLI keeps its own session, separate from the desktop app’s. With standard (managed) keys it then pulls your notes automatically (<code>--no-pull</code> skips it); with private (e2ee) keys, run <code>noteflow pull</code> afterwards. While signed in with Cloud enabled, <code>push</code>, <code>pull</code>, <code>status</code> and the automatic after-command sync use NoteFlow Cloud <strong>instead of</strong> GitHub. Without a terminal (AI agents, scripts) sign in in two steps, no prompts: <code>&lt;email&gt; --send-code</code> emails the code and exits, then <code>&lt;email&gt; --code &lt;code&gt;</code> verifies it (a wrong or expired code can be retried without a new email).',
          es: 'Inicia sesión en tu cuenta NoteFlow con un código de acceso que recibes por email. El CLI guarda su propia sesión, separada de la de la app de escritorio. Con claves estándar (managed) baja después tus notas automáticamente (<code>--no-pull</code> lo omite); con claves privadas (e2ee), ejecuta <code>noteflow pull</code> a continuación. Con sesión y Cloud habilitado, <code>push</code>, <code>pull</code>, <code>status</code> y el sync automático tras cada comando usan NoteFlow Cloud <strong>en vez de</strong> GitHub. Sin terminal (agentes de IA, scripts) se entra en dos pasos, sin prompts: <code>&lt;email&gt; --send-code</code> envía el código y sale, y <code>&lt;email&gt; --code &lt;código&gt;</code> lo verifica (un código erróneo o caducado se puede reintentar sin pedir otro email).',
        },
        example: [
          '$ noteflow cloud login me@example.com',
          '$ noteflow cloud login me@example.com --send-code',
          '$ noteflow cloud login me@example.com --code 12345678',
        ],
      },
      {
        id: 'cloud-logout',
        usage: 'noteflow cloud logout',
        desc: {
          en: 'Sign out. Keeps your local notes and the sync cursor — signing back in with the same account resumes incrementally (another account starts with a full pull).',
          es: 'Cierra la sesión. Conserva las notas locales y el cursor de sync — volver a entrar con la misma cuenta retoma incremental (otra cuenta empieza con un pull completo).',
        },
      },
      {
        id: 'cloud-setup',
        usage: 'noteflow cloud setup',
        desc: {
          en: 'Create the account’s encryption keys in <strong>standard (managed)</strong> mode — nothing to remember. The <strong>private (e2ee)</strong> mode is set up in the desktop app (it shows the one-time recovery code); the CLI then asks for your passphrase or recovery code on each run, or reads <code>NOTEFLOW_CLOUD_PASSPHRASE</code> for servers and cron. Keys are never stored on disk.',
          es: 'Crea las claves de cifrado de la cuenta en modo <strong>estándar (managed)</strong> — nada que recordar. El modo <strong>privado (e2ee)</strong> se configura en la app de escritorio (muestra el recovery code de un solo uso); el CLI pide entonces la passphrase o el recovery code en cada ejecución, o lee <code>NOTEFLOW_CLOUD_PASSPHRASE</code> para servidores y cron. Las claves nunca se guardan en disco.',
        },
      },
      {
        id: 'cloud-push',
        usage: 'noteflow cloud push',
        desc: {
          en: 'Encrypt (AES-256-GCM, client-side) and upload what changed since the last sync — pending uploads and every file that differs from the version last synced — plus the metadata files; it prints how many were unchanged. Each upload carries the server version it was made on, so a file someone changed meanwhile is not overwritten (<code>not uploaded: a newer version is on NoteFlow Cloud</code> — run <code>noteflow pull</code>). The first push runs an automatic initial pull to reconcile with the remote. Uploading requires an active NoteFlow Cloud subscription.',
          es: 'Cifra (AES-256-GCM, en el cliente) y sube lo que cambió desde el último sync — las subidas pendientes y cada fichero que difiere de la versión sincronizada — más los metadatos; indica cuántos no cambiaron. Cada subida lleva la versión del servidor sobre la que se hizo, así que un fichero que otro cambió entretanto no se pisa (<code>not uploaded: a newer version is on NoteFlow Cloud</code> — ejecuta <code>noteflow pull</code>). El primer push ejecuta un pull inicial automático de reconciliación. Subir requiere una suscripción NoteFlow Cloud activa.',
        },
      },
      {
        id: 'cloud-pull',
        usage: 'noteflow cloud pull',
        desc: {
          en: 'Download and decrypt remote changes (incremental), merged <strong>section by section</strong>: a section you edited here and another edited elsewhere are both kept, no copy. If both sides changed the same section, it is merged <strong>line by line</strong> inside the note; only if they changed the same lines are both versions kept between ⚠️ markers (<code>Merged with conflicts: "…"</code>). Encrypted notes still get a conflict copy (<code>Conflict: local changes kept as "…"</code>). Remote deletions only apply when the local copy hasn’t changed since the last sync. Notes this CLI hasn’t synced with the per-file rule yet still follow the note’s <code>updated</code> timestamp; the first run after updating the CLI re-reads the cloud once to cover them.',
          es: 'Baja y descifra los cambios remotos (incremental), combinados <strong>sección a sección</strong>: una sección que editaste aquí y otra editada en otro sitio se conservan las dos, sin copia. Si los dos lados cambiaron la misma sección, se fusiona <strong>línea a línea</strong> dentro de la nota; solo si cambiaron las mismas líneas se guardan las dos versiones entre marcas ⚠️ (<code>Merged with conflicts: "…"</code>). Las notas cifradas siguen creando una copia en conflicto (<code>Conflict: local changes kept as "…"</code>). Los borrados remotos solo se aplican si la copia local no cambió desde el último sync. Las notas que este CLI aún no ha sincronizado con la regla por fichero siguen el <code>updated</code> de la nota; la primera ejecución tras actualizar el CLI relee la nube una vez para cubrirlas.',
        },
      },
      {
        id: 'cloud-status',
        usage: 'noteflow cloud status [--json]',
        desc: {
          en: 'Account email, keys mode (standard/private), sync state and cursor. JSON shape: <code>{ notesDir, noteCount, cloud: { email, enabled, keysMode, lastSync, pullSeq, pullCursor } | null, githubConfigured, desktopApp }</code> (<code>desktopApp</code>: see <code>status</code>).',
          es: 'Email de la cuenta, modo de claves (estándar/privado), estado del sync y cursor. JSON: <code>{ notesDir, noteCount, cloud: { email, enabled, keysMode, lastSync, pullSeq, pullCursor } | null, githubConfigured, desktopApp }</code> (<code>desktopApp</code>: ver <code>status</code>).',
        },
      },
    ]),
  },
  {
    id: 'maintenance',
    label: { en: 'Maintenance', es: 'Mantenimiento' },
    tok: 'pink',
    commands: g('pink', [
      {
        id: 'migrate',
        usage: 'noteflow migrate',
        desc: {
          en: 'One-time migration from the flat v1 layout (<code>&lt;slug&gt;-&lt;id&gt;.md</code>) to the v2 folder-per-note format. Writes the <code>.noteflow-format</code> marker and, with an accessible sync token, pushes the new layout and removes the flat files from the remote. Idempotent — the desktop app runs the same local migration on startup.',
          es: 'Migración única del layout plano v1 (<code>&lt;slug&gt;-&lt;id&gt;.md</code>) al formato v2 carpeta-por-nota. Escribe el marcador <code>.noteflow-format</code> y, con token de sync accesible, sube el nuevo layout y borra los archivos planos del remoto. Idempotente — la app de escritorio ejecuta la misma migración local al arrancar.',
        },
      },
      {
        id: 'self-update',
        usage: 'noteflow self-update',
        desc: {
          en: 'Download the latest <code>cli/noteflow.js</code> from GitHub and replace the current script. Uses the public repo API — no sync login needed. Handy on a headless RPi with no installer.',
          es: 'Descarga el último <code>cli/noteflow.js</code> de GitHub y reemplaza el script actual. Usa la API pública del repo — no requiere login de sync. Útil en una RPi headless sin instalador.',
        },
      },
      {
        id: 'status',
        usage: 'noteflow status [--json]',
        desc: {
          en: 'Show note count, notes directory, groups, GitHub state and last sync. JSON shape: <code>{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups, desktopApp }</code>. <code>desktopApp</code> tells an agent what the desktop app uses so it can offer the same backend: <code>{ cloudSignedIn, cloudSyncEnabled, cloudEmail?, github: { owner, repo } | null }</code>, or <code>null</code> if the app’s settings aren’t found (the app’s sessions and tokens are never shared).',
          es: 'Muestra número de notas, directorio, grupos, estado de GitHub y última sync. JSON: <code>{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups, desktopApp }</code>. <code>desktopApp</code> le dice a un agente qué usa la app de escritorio para proponer el mismo backend: <code>{ cloudSignedIn, cloudSyncEnabled, cloudEmail?, github: { owner, repo } | null }</code>, o <code>null</code> si no se encuentran los ajustes de la app (sus sesiones y tokens nunca se comparten).',
        },
      },
      {
        id: 'help',
        usage: 'noteflow help [command]',
        desc: {
          en: 'General help, or detailed help for one command (<code>help new</code>, <code>help folder</code>…).',
          es: 'Ayuda general, o detallada de un comando (<code>help new</code>, <code>help folder</code>…).',
        },
      },
    ]),
  },
];

// Global flags table (#flags section). `applies` is language-neutral.
export interface GlobalFlag {
  flag: string;
  applies: string;
  desc: L10n;
}

export const globalFlags: GlobalFlag[] = [
  {
    flag: '--json',
    applies: 'list · get · read · path · new · add · set · delete · groups · folders · group create · folder create · status · cloud status · login --no-wait',
    desc: { en: 'Machine-readable JSON output on stdout (info lines go to stderr).', es: 'Salida JSON machine-readable en stdout (las líneas informativas van a stderr).' },
  },
  {
    flag: '--yes',
    applies: 'delete · group delete · folder delete · section delete',
    desc: { en: 'Skip the interactive confirmation.', es: 'Salta la confirmación interactiva.' },
  },
  {
    flag: '--archived',
    applies: 'list',
    desc: { en: 'Include archived notes.', es: 'Incluye notas archivadas.' },
  },
  {
    flag: '--section <name>',
    applies: 'read · path · get · add · set',
    desc: { en: 'Target a section by name.', es: 'Apunta a una sección por nombre.' },
  },
  {
    flag: '--group <name>',
    applies: 'add · new · move · list · folders · folder *',
    desc: { en: 'Target / filter by a group.', es: 'Apunta a / filtra por un grupo.' },
  },
  {
    flag: '--folder <name>',
    applies: 'add · new · move · list',
    desc: { en: 'Target / filter by a folder (requires a group).', es: 'Apunta a / filtra por una carpeta (requiere grupo).' },
  },
  {
    flag: '--ungroup',
    applies: 'move',
    desc: { en: 'Take the note out of its group and folder.', es: 'Saca la nota del grupo y la carpeta.' },
  },
  {
    flag: '--text / --file / --stdin',
    applies: 'add · set',
    desc: { en: 'Source of the content to write (first one present wins).', es: 'Fuente del contenido a escribir (gana la primera presente).' },
  },
  {
    flag: '--create',
    applies: 'add · set',
    desc: { en: 'Create a missing section (and, in <code>add</code>, a missing <code>--title</code> note) instead of failing.', es: 'Crea la sección que falte (y, en <code>add</code>, la nota de <code>--title</code>) en vez de fallar.' },
  },
  {
    flag: '--dry-run',
    applies: 'add · set',
    desc: { en: 'Resolve the target without writing or syncing anything — fails exactly like the real run would.', es: 'Resuelve el destino sin escribir ni sincronizar — falla igual que lo haría la ejecución real.' },
  },
  {
    flag: '--raw',
    applies: 'add · set · new · section add',
    desc: { en: 'Create the new section in text mode (default: markdown mode; <code>--markdown</code>/<code>--rich</code> are accepted aliases of the default).', es: 'Sección nueva en modo texto (default: modo markdown; <code>--markdown</code>/<code>--rich</code> se aceptan como alias del default).' },
  },
  {
    flag: '--force',
    applies: 'pull',
    desc: { en: 'GitHub only: overwrite even when the local note is newer.', es: 'Solo GitHub: sobrescribe aunque la nota local sea más nueva.' },
  },
  {
    flag: '--no-pull',
    applies: 'login · cloud login',
    desc: { en: 'Connect without the initial pull.', es: 'Conecta sin el pull inicial.' },
  },
  {
    flag: '--no-wait / --finish',
    applies: 'login',
    desc: { en: 'GitHub sign-in in two steps that never block: print the code and exit, then finish once authorized.', es: 'Login de GitHub en dos pasos que nunca bloquean: muestra el código y sale; luego termina una vez autorizado.' },
  },
  {
    flag: '--send-code / --code <code>',
    applies: 'cloud login <email>',
    desc: { en: 'NoteFlow Cloud sign-in in two steps, no prompts: email the code, then verify it.', es: 'Login de NoteFlow Cloud en dos pasos, sin prompts: envía el código y luego lo verifica.' },
  },
];

// Group colours accepted by `group create --color` (brain-site.css rgb-triple tokens).
export const groupColors = ['accent', 'accent-2', 'red', 'cyan', 'purple', 'text', 'orange', 'pink'];
