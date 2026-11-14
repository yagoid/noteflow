/**
 * welcomeNote.ts — the note a brand-new install opens with, so the app never
 * starts empty.
 *
 * Created by main.ts at startup (after the v1→v2 migration, before the initial
 * pull and the watcher) only on a real first run: no settings.json yet, no
 * notes in the notes dir and no sync backend configured. The setting
 * is written on that first decision whatever it was (created or not), so the
 * note is never recreated after the user deletes it and never appears for an
 * existing user who later empties the notes dir.
 *
 * The note is LOCAL-ONLY (`localOnly: true`, see localOnlyNotes.ts): it is never
 * uploaded to GitHub / NoteFlow Cloud, so installing on a second computer that
 * syncs with the same account doesn't add a second copy to the account. Editing
 * it keeps it local (the flag round-trips through every format mirror).
 *
 * Content is generated in the UI language at creation time (it is user content
 * afterwards: switching language later doesn't rewrite it) and with the
 * platform's shortcut labels (⌘ on macOS). Pure module apart from the types.
 */
import type { DiskNote, DiskSection } from './noteFormat'
import type { Lang } from './i18n'

/** settings.json key: the first-run decision was taken (created or not). */
export const WELCOME_SEEDED_KEY = 'welcomeNoteSeeded'

export type WelcomeNoteDecision = 'skip' | 'mark-only' | 'create'

export interface WelcomeNoteInput {
  /** settings.json already carries `welcomeNoteSeeded: true`. */
  alreadySeeded: boolean
  /**
   * settings.json existed before this start. Nothing writes it earlier in the
   * startup, so its absence is THE fresh-install signal; an install that has
   * one (any user updating from a build without this feature) never gets the note.
   */
  settingsExisted: boolean
  /** The notes dir holds any note (or couldn't be read — treated as "has notes"). */
  hasNotes: boolean
  /** A sync backend (GitHub Sync or NoteFlow Cloud) is already set up on this device. */
  syncConfigured: boolean
}

/**
 * Pure first-run decision: 'create' only on a real first run (no settings.json
 * yet, empty notes dir, no sync); 'mark-only' when the decision must be recorded
 * without creating (existing install / notes / synced device); 'skip' when it
 * was already taken.
 */
export function planWelcomeNote(input: WelcomeNoteInput): WelcomeNoteDecision {
  if (input.alreadySeeded) return 'skip'
  if (input.settingsExisted || input.hasNotes || input.syncConfigured) return 'mark-only'
  return 'create'
}

/** Pure: whether settings.json shows a configured sync backend (GitHub or Cloud). */
export function isSyncConfigured(settings: Record<string, unknown>): boolean {
  const enabled = (key: string) => {
    const v = settings[key]
    return !!v && typeof v === 'object' && (v as { enabled?: unknown }).enabled === true
  }
  return enabled('githubSync') || enabled('cloudSync')
}

// ── Content ──────────────────────────────────────────────────────────────────

interface WelcomeText {
  title: string
  sections: Array<{ name: string; body: (k: Keys) => string }>
}

/** Shortcut labels for the platform (same symbols as src/lib/platform.ts). */
interface Keys {
  /** Accelerator: Ctrl, ⌘ on macOS. */
  mod: string
  shift: string
  /** Literal Control (section cycling): Ctrl, ⌃ on macOS. */
  control: string
}

export function shortcutKeys(platform: string): Keys {
  const mac = platform === 'darwin'
  return { mod: mac ? '⌘' : 'Ctrl', shift: mac ? '⇧' : 'Shift', control: mac ? '⌃' : 'Ctrl' }
}

const EN: WelcomeText = {
  title: 'Welcome to NoteFlow',
  sections: [
    {
      name: 'Welcome',
      body: (k) => `# Welcome to NoteFlow

NoteFlow is a quick-notes app that lives in your system tray. Press **${k.mod}+${k.shift}+Space** from anywhere to show or hide it.

This note is a short tour: each tab above is a **section** of the note. Click the tabs, or press **${k.control}+Tab**, to go through them.

> This welcome note only exists on this computer: it is **never synced** to NoteFlow Cloud or GitHub, even if you edit it. Delete it whenever you like.
`,
    },
    {
      name: 'Notes',
      body: (k) => `## Create

- **${k.mod}+N** — new note
- **${k.mod}+${k.shift}+N** — temporary note (it deletes itself after 24 hours)

## Find

- **${k.mod}+P** — command palette: jump to a note or run an action
- **${k.mod}+${k.shift}+F** — search all your notes

## Organize

- Sort your notes into **groups** and **folders** from the sidebar.
- Mark a note as favorite (⭐) to keep it at the top.
- **${k.mod}+Click** a note in the sidebar to open it side by side.
`,
    },
    {
      name: 'Sections',
      body: (k) => `A note can hold several sections, like the tabs of this one.

- **${k.mod}+T** — new section
- **${k.mod}+W** — delete the current section
- **${k.control}+Tab** / **${k.control}+${k.shift}+Tab** — next / previous section
- Double-click a tab to rename it, drag it to reorder it, or right-click it for more options (color, duplicate, open as a sticky note…).
`,
    },
    {
      name: 'Writing',
      body: (k) => `Sections are written in **Markdown** and shown formatted:

- **Bold** (${k.mod}+B), *italic* (${k.mod}+I) and \`inline code\` (${k.mod}+E)
- Start a line with \`#\` for a heading or \`-\` for a list
- Type \`/\` to link another section or insert a snippet

\`\`\`js
const idea = 'write it down before it flies away'
\`\`\`

## Tasks

- [x] Tick a task when it's done
- [ ] Hover a task to give it a deadline, an alarm or a priority
- [ ] Try ticking this one

**${k.mod}+M** switches a section between markdown mode (formatted) and text mode (shown as is).
`,
    },
    {
      name: 'Sticky notes',
      body: (k) => `Keep a section on top of every window as a **sticky note**:

- **${k.mod}+S** — open the current section as a sticky note
- **${k.mod}+G** — open every section of the note as sticky notes

Sticky notes stay in sync with the main window, remember where you left them and can be folded into a small pill.
`,
    },
    {
      name: 'Sync & AI',
      body: () => `## Sync

Your notes are plain Markdown files on this computer. To have them on all your devices, open **Settings → Sync** and choose **NoteFlow Cloud** or **GitHub Sync** (a private repository of your own).

## AI

The **brain** button in the title bar shows your notes as a graph. From there you can turn on the local AI to find related notes, and chat with your notes.
`,
    },
  ],
}

const ES: WelcomeText = {
  title: 'Bienvenida a NoteFlow',
  sections: [
    {
      name: 'Bienvenida',
      body: (k) => `# Te damos la bienvenida a NoteFlow

NoteFlow es una app de notas rápidas que vive en la bandeja del sistema. Pulsa **${k.mod}+${k.shift}+Space** desde cualquier sitio para mostrarla u ocultarla.

Esta nota es un recorrido breve: cada pestaña de arriba es una **sección** de la nota. Pulsa las pestañas, o **${k.control}+Tab**, para recorrerlas.

> Esta nota de bienvenida solo existe en este ordenador: **nunca se sincroniza** con NoteFlow Cloud ni con GitHub, aunque la edites. Bórrala cuando quieras.
`,
    },
    {
      name: 'Notas',
      body: (k) => `## Crear

- **${k.mod}+N** — nota nueva
- **${k.mod}+${k.shift}+N** — nota temporal (se borra sola a las 24 horas)

## Encontrar

- **${k.mod}+P** — paleta de comandos: salta a una nota o ejecuta una acción
- **${k.mod}+${k.shift}+F** — busca en todas tus notas

## Organizar

- Ordena tus notas en **grupos** y **carpetas** desde la barra lateral.
- Marca una nota como favorita (⭐) para tenerla siempre arriba.
- **${k.mod}+Clic** en una nota de la barra lateral la abre en paralelo.
`,
    },
    {
      name: 'Secciones',
      body: (k) => `Una nota puede tener varias secciones, como las pestañas de esta.

- **${k.mod}+T** — sección nueva
- **${k.mod}+W** — borra la sección actual
- **${k.control}+Tab** / **${k.control}+${k.shift}+Tab** — sección siguiente / anterior
- Haz doble clic en una pestaña para renombrarla, arrástrala para reordenarla o haz clic derecho para ver más opciones (color, duplicar, abrir como nota flotante…).
`,
    },
    {
      name: 'Escribir',
      body: (k) => `Las secciones se escriben en **Markdown** y se muestran con formato:

- **Negrita** (${k.mod}+B), *cursiva* (${k.mod}+I) y \`código\` (${k.mod}+E)
- Empieza una línea con \`#\` para un título o con \`-\` para una lista
- Escribe \`/\` para enlazar otra sección o insertar un fragmento

\`\`\`js
const idea = 'apúntala antes de que se escape'
\`\`\`

## Tareas

- [x] Marca una tarea cuando la termines
- [ ] Pasa el ratón por una tarea para ponerle fecha límite, alarma o prioridad
- [ ] Prueba a marcar esta

**${k.mod}+M** cambia una sección entre el modo markdown (con formato) y el modo texto (tal cual).
`,
    },
    {
      name: 'Notas flotantes',
      body: (k) => `Deja una sección encima de todas las ventanas como **nota flotante**:

- **${k.mod}+S** — abre la sección actual como nota flotante
- **${k.mod}+G** — abre todas las secciones de la nota como notas flotantes

Las notas flotantes se sincronizan al momento con la ventana principal, recuerdan dónde las dejaste y se pueden plegar en una pequeña píldora.
`,
    },
    {
      name: 'Sync e IA',
      body: () => `## Sincronización

Tus notas son archivos Markdown normales en este ordenador. Para tenerlas en todos tus dispositivos, abre **Ajustes → Sincronización** y elige **NoteFlow Cloud** o **GitHub Sync** (un repositorio privado tuyo).

## IA

El botón del **cerebro** en la barra de título muestra tus notas como un grafo. Desde ahí puedes activar la IA local para encontrar notas relacionadas y chatear con tus notas.
`,
    },
  ],
}

/**
 * Pure: the welcome note as a DiskNote (serialize with noteFormat.serializeNoteFolder).
 * `newId(n)` supplies ids (note: 8 chars, sections: 6); `now` stamps the note and
 * its sections (initial sections share the note's `created`, see note-format.md).
 */
export function buildWelcomeNote(lang: Lang, platform: string, now: string, newId: (chars: number) => string): DiskNote {
  const text = lang === 'es' ? ES : EN
  const keys = shortcutKeys(platform)
  const sections: DiskSection[] = text.sections.map((s) => ({
    id: newId(6),
    name: s.name,
    // No trailing newline: the editor saves without one, so opening the note
    // doesn't rewrite it (tests/electron/welcomeNoteEditor.test.ts).
    content: s.body(keys).replace(/\n+$/, ''),
    created: now,
  }))
  return {
    id: newId(8),
    title: text.title,
    tags: [],
    created: now,
    updated: now,
    localOnly: true,
    sections,
  }
}
