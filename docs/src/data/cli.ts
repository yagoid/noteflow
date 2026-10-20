// Structural reference data for the /cli page — mirrors the NoteFlow CLI v1.10.0.
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
          en: 'Append text to today’s daily note (title <code>DD-MM-YYYY</code>) — or to any note via <code>--title</code>. Creates the note if it doesn’t exist; the text is appended to the end of the section, separated by a newline.',
          es: 'Añade texto a la nota diaria de hoy (título <code>DD-MM-YYYY</code>) — o a cualquier nota con <code>--title</code>. Crea la nota si no existe; el texto se añade al final de la sección, separado por un salto de línea.',
        },
        flags: [
          { flag: '--title <title>', desc: { en: 'Write into the note with that title instead of today’s.', es: 'Escribe en la nota con ese título en vez de la del día.' } },
          { flag: '--section <name>', desc: { en: 'Target section/tab. Created if missing. Default: <code>Note</code>.', es: 'Sección/pestaña destino. La crea si no existe. Default: <code>Note</code>.' } },
          { flag: '--tag <tag>', desc: { en: 'Add this tag to the note (if it doesn’t have it yet).', es: 'Añade este tag a la nota (si no lo tiene ya).' } },
          { flag: '--group <name>', desc: { en: 'Assign the note to a group.', es: 'Asigna la nota a un grupo.' } },
          { flag: '--folder <name>', desc: { en: 'Place the note in a folder of that group (requires <code>--group</code>).', es: 'Coloca la nota en una carpeta de ese grupo (requiere <code>--group</code>).' } },
          { flag: '--raw / --rich', desc: { en: 'New section in raw/markdown mode (default) or rich text.', es: 'Sección nueva en modo raw/markdown (default) o rich text.' } },
        ],
        example: ['$ noteflow add "Fix: CORS on /api/notes"', '$ noteflow add "Check server logs" --section Tasks --tag urgent'],
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
        usage: 'noteflow set <title> <section> [source] [--rich]',
        desc: {
          en: '<strong>Replace</strong> a section’s content (creating it if missing) — the complement of <code>add</code>, which only appends. The recommended way to edit a section. On ambiguous duplicate names without a <code>#n</code> suffix, it fails instead of guessing.',
          es: '<strong>Reemplaza</strong> el contenido de una sección (la crea si no existe) — el complemento de <code>add</code>, que solo añade al final. La forma recomendada de editar una sección. Ante nombres duplicados ambiguos sin sufijo <code>#n</code>, falla en vez de adivinar.',
        },
        flags: [
          { flag: '--text "<content>"', desc: { en: 'Inline text (first source present wins).', es: 'Texto inline (gana la primera fuente presente).' } },
          { flag: '--file <path>', desc: { en: 'Read the content from a file — the most reliable route on Windows/PowerShell.', es: 'Lee el contenido de un archivo — la vía más fiable en Windows/PowerShell.' } },
          { flag: '--stdin', desc: { en: 'Read from stdin (also used automatically when piped).', es: 'Lee de stdin (también se usa automáticamente al recibir un pipe).' } },
          { flag: '--rich', desc: { en: 'If the section is created, create it in rich-text mode (default: raw).', es: 'Si crea la sección, la crea en modo rich text (default: raw).' } },
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
          en: 'List a note’s sections with name, line count and mode (raw/rich). <code>section list</code> is an alias.',
          es: 'Lista las secciones de una nota con nombre, número de líneas y modo (raw/rich). <code>section list</code> es un alias.',
        },
      },
      {
        id: 'section-add',
        usage: 'noteflow section add <title> <name> [--rich]',
        desc: {
          en: 'Create an empty section (raw by default; <code>--rich</code> for rich text). Sections are managed by name — no ids needed.',
          es: 'Crea una sección vacía (raw por defecto; <code>--rich</code> para rich text). Las secciones se gestionan por nombre — sin ids.',
        },
        example: ['$ noteflow section add "Project Alpha" "Meeting Notes"'],
      },
      {
        id: 'section-rename',
        usage: 'noteflow section rename <title> <old> <new>',
        desc: {
          en: 'Rename a section (the file on disk doesn’t change — it’s addressed by id).',
          es: 'Renombra una sección (el archivo en disco no cambia — va por id).',
        },
      },
      {
        id: 'section-delete',
        usage: 'noteflow section delete <title> <name> [--yes]',
        desc: {
          en: 'Delete a section (confirmation unless <code>--yes</code>). <strong>Refuses to delete the last one.</strong> Disambiguate duplicates with <code>"Tasks#2"</code>.',
          es: 'Borra una sección (confirmación salvo <code>--yes</code>). <strong>Rechaza borrar la última.</strong> Desambigua duplicados con <code>"Tasks#2"</code>.',
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
        usage: 'noteflow login [repo-name] [--no-pull]',
        desc: {
          en: 'Connect to GitHub via Device Flow OAuth — it prints a code and a URL to authorize from any browser (perfect for headless boxes). Default repo: <code>noteflow-notes</code>. Once connected it <strong>pulls the repo’s notes automatically</strong> (local notes that are newer are kept), so a fresh machine is ready right away; <code>--no-pull</code> connects only. Skipped while NoteFlow Cloud is the active backend. The CLI keeps its own token, separate from the desktop app’s.',
          es: 'Conecta con GitHub vía Device Flow OAuth — muestra un código y una URL para autorizar desde cualquier navegador (ideal en headless). Repo por defecto: <code>noteflow-notes</code>. Al conectar <strong>baja automáticamente las notas del repo</strong> (se conservan las locales más recientes), así una máquina nueva queda lista al momento; <code>--no-pull</code> solo conecta. Se omite mientras NoteFlow Cloud es el backend activo. El CLI guarda su propio token, separado del de la app de escritorio.',
        },
      },
      {
        id: 'logout',
        usage: 'noteflow logout',
        desc: { en: 'Disconnect from GitHub.', es: 'Desconecta de GitHub.' },
      },
      {
        id: 'push',
        usage: 'noteflow push',
        desc: { en: 'Upload every note to the repo.', es: 'Sube todas las notas al repositorio.' },
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
        usage: 'noteflow cloud login [email] [--no-pull]',
        desc: {
          en: 'Sign in to your NoteFlow account with an emailed 6-digit code. The CLI keeps its own session, separate from the desktop app’s. With standard (managed) keys it then pulls your notes automatically (<code>--no-pull</code> skips it); with private (e2ee) keys, run <code>noteflow pull</code> afterwards. While signed in with Cloud enabled, <code>push</code>, <code>pull</code>, <code>status</code> and the automatic after-command sync use NoteFlow Cloud <strong>instead of</strong> GitHub.',
          es: 'Inicia sesión en tu cuenta NoteFlow con un código de 6 dígitos por email. El CLI guarda su propia sesión, separada de la de la app de escritorio. Con claves estándar (managed) baja después tus notas automáticamente (<code>--no-pull</code> lo omite); con claves privadas (e2ee), ejecuta <code>noteflow pull</code> a continuación. Con sesión y Cloud habilitado, <code>push</code>, <code>pull</code>, <code>status</code> y el sync automático tras cada comando usan NoteFlow Cloud <strong>en vez de</strong> GitHub.',
        },
        example: ['$ noteflow cloud login me@example.com'],
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
          en: 'Encrypt and upload every note and metadata file (AES-256-GCM, client-side). The first push runs an automatic initial pull to reconcile with the remote. Uploading requires an active NoteFlow Cloud subscription.',
          es: 'Cifra y sube todas las notas y metadatos (AES-256-GCM, en el cliente). El primer push ejecuta un pull inicial automático de reconciliación. Subir requiere una suscripción NoteFlow Cloud activa.',
        },
      },
      {
        id: 'cloud-pull',
        usage: 'noteflow cloud pull',
        desc: {
          en: 'Download and decrypt remote changes (incremental). The note’s <code>updated</code> timestamp decides: a newer remote wins the whole note folder; remote deletions only apply when the local copy hasn’t changed since the last sync.',
          es: 'Baja y descifra los cambios remotos (incremental). Decide el <code>updated</code> de la nota: un remoto más nuevo gana la carpeta entera; los borrados remotos solo se aplican si la copia local no cambió desde el último sync.',
        },
      },
      {
        id: 'cloud-status',
        usage: 'noteflow cloud status [--json]',
        desc: {
          en: 'Account email, keys mode (standard/private), sync state and cursor. JSON shape: <code>{ notesDir, noteCount, cloud: { email, enabled, keysMode, lastSync, pullSeq, pullCursor } | null, githubConfigured }</code>.',
          es: 'Email de la cuenta, modo de claves (estándar/privado), estado del sync y cursor. JSON: <code>{ notesDir, noteCount, cloud: { email, enabled, keysMode, lastSync, pullSeq, pullCursor } | null, githubConfigured }</code>.',
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
          en: 'Show note count, notes directory, groups, GitHub state and last sync. JSON shape: <code>{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups }</code>.',
          es: 'Muestra número de notas, directorio, grupos, estado de GitHub y última sync. JSON: <code>{ notesDir, noteCount, github: { owner, repo, lastSync, tokenAccessible }, groups }</code>.',
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
    applies: 'list · get · read · path · new · groups · folders · status · cloud status',
    desc: { en: 'Machine-readable JSON output.', es: 'Salida JSON machine-readable.' },
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
    applies: 'set',
    desc: { en: 'Source of the content to write (first one present wins).', es: 'Fuente del contenido a escribir (gana la primera presente).' },
  },
  {
    flag: '--rich',
    applies: 'add · set · section add',
    desc: { en: 'Create the new section in rich-text mode (default: raw).', es: 'Sección nueva en modo rich text (default: raw).' },
  },
];

// Group colours accepted by `group create --color` (brain-site.css rgb-triple tokens).
export const groupColors = ['accent', 'accent-2', 'red', 'cyan', 'purple', 'text', 'orange', 'pink'];
