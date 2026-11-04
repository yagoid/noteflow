// Copy en español de la página /cli — debe satisfacer la forma de cli.en.ts.
import type { CliContent } from './cli.en';

export const cliEs: CliContent = {
  meta: {
    title: 'NoteFlow CLI — notas headless desde tu terminal',
    description:
      'Referencia completa del CLI de NoteFlow v1.10.0: crea, lee, edita y organiza notas markdown desde cualquier terminal, sincroniza con GitHub o NoteFlow Cloud e intégralo en scripts o agentes de IA. Un único script Node.js, cero dependencias.',
  },

  hero: {
    kicker: 'NoteFlow · Referencia del CLI',
    h1: 'Tus notas,<br />headless.',
    tagline:
      'Todo el cuaderno desde cualquier terminal — un único script Node.js, cero dependencias, los mismos archivos que la app de escritorio.',
    termTitle: 'pi@homelab: ~',
    termLines: [
      '~ $ noteflow --help',
      'NoteFlow CLI — notas rápidas desde tu terminal',
      '',
      'uso: noteflow <comando> [opciones]',
      '',
      '  add · new · list · get · read · set · path · touch',
      '  sections · section · move · groups · folders',
      '  login · cloud · push · pull · migrate · self-update · status',
      '',
      '~ $ noteflow add "Funciona." --section Ideas',
      '✓ Añadido a "07-07-2026" · Ideas',
    ],
  },

  toc: [
    { id: 'install', label: 'Instalación' },
    { id: 'notes-dir', label: 'Directorio de notas' },
    { id: 'format', label: 'Formato de nota' },
    { id: 'commands', label: 'Comandos' },
    { id: 'flags', label: 'Flags y colores' },
    { id: 'agents', label: 'Para agentes de IA' },
    { id: 'caveats', label: 'Avisos' },
    { id: 'troubleshooting', label: 'Problemas comunes' },
  ],

  install: {
    title: 'Un script, cero dependencias',
    intro: [
      'El CLI de NoteFlow es un único script Node.js standalone — <code>cli/noteflow.js</code>, sin paquetes npm. Lee y escribe los <strong>mismos archivos que la app de escritorio</strong>: mismo directorio de notas, mismo formato, sin daemon de por medio. Eso lo hace perfecto para servidores, Raspberry Pis y cualquier máquina sin pantalla.',
    ],
    headlessH3: 'Linux / Raspberry Pi (headless)',
    headlessTermTitle: 'instalación',
    installCmd: 'curl -fsSL https://raw.githubusercontent.com/yagoid/noteflow/main/cli/install-cli.sh | sudo bash',
    desktopH3: 'Linux desktop / Windows',
    desktopP:
      'Nada que hacer — el CLI se instala automáticamente con los instaladores <code>.deb</code> y <code>.exe</code> de NoteFlow.',
    reqP: 'Único requisito: <strong>Node.js ≥ 18</strong>. Para actualizar una instalación standalone más adelante, ejecuta <code>noteflow self-update</code>.',
  },

  notesDir: {
    title: 'Dónde viven tus notas',
    intro: [
      'El CLI opera directamente sobre el directorio de notas de NoteFlow — archivos planos en tu disco, sin base de datos:',
    ],
    colPlatform: 'Plataforma',
    colPath: 'Ruta',
    rows: [
      { platform: 'Linux', path: '~/.local/share/noteflow-notes/' },
      { platform: 'Windows / macOS', path: '~/noteflow-notes/' },
    ],
    envP:
      'La variable de entorno <code>NOTEFLOW_NOTES_DIR</code> apunta el CLI a otro directorio — útil para scripting y pruebas contra un sandbox.',
  },

  format: {
    title: 'Formato de nota (v2 — carpeta por nota)',
    intro: [
      'Cada nota es un <strong>directorio</strong> <code>&lt;slug&gt;-&lt;id&gt;/</code> con un <code>note.md</code> (solo frontmatter: metadatos + índice de secciones) y <strong>un archivo <code>.md</code> por sección</strong> (markdown puro):',
    ],
    termTitle: 'noteflow-notes/',
    treeLines: [
      'proyecto-alpha-abc12345/',
      '  note.md       ← ancla de metadatos + índice de secciones',
      '  sec001.md     ← cuerpo de la sección "Note"',
      '  sec002.md     ← cuerpo de la sección "Tasks"',
    ],
    bullets: [
      'El contenido de cada sección vive en su propio <code>&lt;sectionId&gt;.md</code> — sin frontmatter, solo markdown.',
      'El campo <code>updated:</code> de <code>note.md</code> es el timestamp canónico de sincronización de toda la nota.',
      '<code>isRawMode: true</code> significa modo texto (la app muestra el contenido tal cual, sin renderizar); <code>false</code>, modo markdown (la app lo renderiza). En ambos casos el fichero de la sección guarda markdown plano.',
      'Las notas con bloque <code>encryption:</code> en <code>note.md</code> están cifradas (la carpeta solo contiene <code>note.md</code>) — el CLI las ignora.',
      'Un marcador <code>.noteflow-format</code> (con contenido <code>2</code>) en la raíz del directorio señala el formato v2.',
    ],
    migrateP:
      '¿Vienes del layout plano v1? Un único <code>noteflow migrate</code> lo convierte todo — mira la <a href="#commands">tabla de comandos</a>.',
  },

  commands: {
    title: 'Referencia de comandos',
    intro: [
      'Todo se direcciona <strong>por nombre</strong>: título de nota + nombre de sección — nunca tocas ids. Los títulos pueden ser parciales (con varios matches el CLI los lista y pide precisión), y los nombres de sección duplicados se apuntan con un sufijo 1-based tipo <code>"Tasks#2"</code>. Entrecomilla los nombres con espacios.',
    ],
    colCommand: 'Comando',
    colDesc: 'Qué hace',
    flagsLabel: 'Opciones',
    exampleLabel: 'Ejemplo',
  },

  flags: {
    title: 'Flags globales, colores y variables de entorno',
    intro: ['Algunos flags se repiten entre comandos con el mismo significado en todos:'],
    colFlag: 'Flag',
    colApplies: 'Aplica a',
    colDesc: 'Descripción',
    colorsH3: 'Colores de grupo',
    colorsP:
      'La paleta que acepta <code>group create --color</code> — los mismos tokens de color que usa la app de escritorio para los puntos de grupo y los acentos de nota:',
    envH3: 'Variables de entorno',
    envRows: [
      {
        name: 'NOTEFLOW_NOTES_DIR',
        desc: 'Redirige el directorio de notas (scripting / testing).',
      },
      {
        name: 'NOTEFLOW_NO_APP_CHECK',
        desc: 'Ponla a <code>1</code> para silenciar el aviso por stderr al mutar grupos/carpetas con la app de escritorio abierta.',
      },
      {
        name: 'NOTEFLOW_CLOUD_PASSPHRASE',
        desc: 'Passphrase (o recovery code) para cuentas NoteFlow Cloud en modo privado (e2ee) — evita el prompt interactivo en servidores y cron. Nunca se guarda en disco.',
      },
    ],
    colEnv: 'Variable',
    colEnvDesc: 'Efecto',
  },

  agents: {
    title: 'Una herramienta pensada para agentes de IA',
    intro: [
      'El CLI es deliberadamente agent-friendly: todos los comandos de lectura aceptan <code>--json</code> para salida machine-readable, los resultados van a <strong>stdout</strong> y los errores a <strong>stderr</strong>, y el exit code es <code>0</code> en éxito y <code>1</code> en error. Como todo se direcciona por título de nota y nombre de sección, un agente nunca necesita rastrear ids.',
      'Dos convenciones importan: <code>read</code> vs <code>get</code> — <code>get</code> es para humanos (indenta y decora) mientras <code>read</code> emite el contenido verbatim, así que los agentes deben usar siempre <code>read</code>. Y <code>set</code> vs <code>add</code> — <code>set</code> <strong>reemplaza</strong> una sección, <code>add</code> <strong>añade al final</strong>.',
      'Para <strong>ediciones parciales de una sección grande</strong> hay un atajo: el CLI no tiene find-replace, así que <code>read</code> + <code>set</code> obliga a sacar la sección entera y volver a escribirla. Si tu agente ya tiene herramientas de edición de ficheros, pídele a <code>path</code> el <code>.md</code> de la sección, edítalo in situ y cierra con <code>touch</code> — que bumpea <code>updated:</code> y hace el push.',
    ],
    flowH3: 'Flujo típico de un agente',
    flowTermTitle: 'sesión de agente',
    flowLines: [
      '# 1 · descubrir notas y nombres de sección',
      '$ noteflow list --json',
      '# 2 · leer una sección concreta, raw (apta para pipe)',
      '$ noteflow read "Proyecto Alpha" "Tasks"',
      '# 3 · sobrescribirla — o añadir al final con `add`',
      '$ noteflow set "Proyecto Alpha" "Tasks" --text "- [x] deploy"',
      '# 3b · …o editar el fichero de la sección in situ con tus herramientas',
      '$ noteflow path "Proyecto Alpha" "Tasks"',
      '$ noteflow touch "Proyecto Alpha"',
      '# 4 · sincronizar',
      '$ noteflow push',
    ],
    skillH3: 'Instala la skill',
    skillP:
      '¿Usas Claude Code u otro agente compatible con skills? Instala la skill del CLI de NoteFlow y tu agente recibe la referencia completa de comandos, gotchas incluidos:',
    skillTermTitle: 'skills',
    skillCmd: 'npx skills add yagoid/noteflow/cli/noteflow-cli',
  },

  caveats: {
    title: 'Avisos que conviene conocer',
    items: [
      {
        title: 'App de escritorio abierta ⇒ los cambios de grupos/carpetas pueden perderse',
        html:
          'La app mantiene <code>groups.json</code> / <code>folders.json</code> en memoria y <strong>los reescribe en sus propios ciclos</strong> (guardados y el auto-sync cada 5 minutos), pisando los grupos y carpetas creados desde el CLI mientras corre. Los cambios a nivel de nota — contenido, secciones, favorito, archivo — sí sobreviven: viven en carpetas por-nota. El CLI <strong>avisa por stderr</strong> si detecta NoteFlow en ejecución al mutar grupos/carpetas (siléncialo con <code>NOTEFLOW_NO_APP_CHECK=1</code>). Para cambios estructurales fiables, cierra la app primero — o hazlos desde la propia app.',
      },
      {
        title: 'PowerShell: --text multilínea puede truncarse en silencio',
        html:
          'En Windows/PowerShell, un <code>--text</code> con saltos de línea puede <strong>truncarse a la primera línea</strong> sin avisar. Para cualquier cosa más allá de una línea usa <code>--file &lt;ruta&gt;</code> (la vía más fiable) o <code>--stdin</code>. Regla práctica: contenido no trivial → <code>--file</code>.',
      },
      {
        title: 'BOM en --stdin',
        html:
          'PowerShell antepone un BOM a pipes y here-strings; el CLI lo limpia automáticamente, así que el contenido llega limpio.',
      },
    ],
  },

  troubleshooting: {
    title: 'Problemas comunes',
    items: [
      {
        q: '«noteflow: command not found»',
        a:
          'El script de instalación headless deja el CLI en <code>/usr/local/bin/noteflow</code> — comprueba que está en tu <code>PATH</code>. En escritorio viene con los instaladores <code>.deb</code> / <code>.exe</code>; abre una terminal nueva tras instalar.',
      },
      {
        q: 'Estoy logueado en la app, pero el CLI me pide login',
        a:
          'Es lo esperado: el CLI <strong>no puede descifrar</strong> los tokens que la app de escritorio guarda con <code>safeStorage</code> de Electron, y las sesiones tampoco pueden compartirse (rotan en cada uso). Mantiene sus propias credenciales — ejecuta <code>noteflow login</code> (GitHub) o <code>noteflow cloud login</code> (NoteFlow Cloud) una vez.',
      },
      {
        q: 'Una nota no aparece en list / read',
        a:
          'Las notas cifradas (bloque <code>encryption:</code> en <code>note.md</code>) se <strong>ignoran en todos los comandos de lectura</strong>, por diseño. Descífrala en la app de escritorio si necesitas acceder desde el CLI.',
      },
      {
        q: 'Mis grupos o carpetas creados desde el CLI desaparecieron / pull no cambió nada',
        a:
          'Dos reglas de sync: el auto-sync de la app de escritorio reescribe <code>groups.json</code> / <code>folders.json</code> mientras corre (mira los <a href="#caveats">avisos</a>), y <code>pull</code> solo sobreescribe una nota local cuando el <code>updated:</code> remoto es más reciente. Cierra la app para cambios estructurales, y consulta la última sync con <code>noteflow status</code>.',
      },
    ],
  },
};
