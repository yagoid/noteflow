// Main-process i18n. `electron/` compiles separately to `dist-electron/` and must
// not import from `src/`, so this is a small self-contained mirror of the string
// tree. It covers every user-facing string the main process shows natively: the
// tray menu + tooltips, OS notifications, and native file-dialog titles. All of
// these are resolved at call-time from the persisted `language` setting (see
// `mainMessages()` in main.ts) so they follow the same live-switch behaviour as
// the renderer. Alarm notifications carry only user content (note title + task
// text), so there is nothing to translate there. The sync engine also takes the
// label of the conflict copies it creates from here (injected by main.ts).

export type Lang = 'en' | 'es'
export type LanguageSetting = Lang | 'system'

export interface TrayMessages {
  tooltip: string
  tooltipShortcutUnavailable: string
  open: string
  newNote: string
  openNotesFolder: string
  quit: string
}

export interface NotificationMessages {
  updateDownloadedTitle: string
  updateDownloadedBody: string
}

export interface DialogMessages {
  chooseNotesFolder: string
  exportNote: string
  chooseDestinationFolder: string
  exportNotes: string
  importNotes: string
  chooseMarkdownFolder: string
  importNotion: string
  importGoogleKeep: string
  addFilesToProfile: string
  attachFilesToChat: string
  // Linked notes (external text files): pick files to link / the new location of one, and
  // the picker's filters.
  linkFiles: string
  relocateLinkedFile: string
  linkFilterAllFiles: string
  linkFilterMarkdown: string
  // Agent tasks → Run: the project folder of a note (where the agent works).
  chooseAgentFolder: string
  // Agent tasks → Run: the native approval of a CUSTOM command / link (shown with its exact
  // text as the first paragraph of the detail; Cancel is the default button).
  agentApproveCommand: string
  agentApproveCommandDetail: string
  agentApproveCommandConfirm: string
  agentApproveUrl: string
  agentApproveUrlDetail: string
  // Added for an http(s) link.
  agentApproveUrlWeb: string
  agentApproveUrlConfirm: string
  agentApproveCancel: string
}

export interface ChatErrorMessages {
  quotaExceeded: string
  // NoteFlow AI proxy answered 401 (session token rejected) / 403 (no active plan).
  managedSignInAgain: string
  managedSubscriptionInactive: string
  // No access token for the managed preset (account.getAccessTokenResult): why.
  managedNoSession: string
  managedOffline: string
  managedKeychainLocked: string
  managedServiceUnavailable: string
}

export interface SyncMessages {
  // Suffix of the title of a conflict copy made by the NoteFlow Cloud pull:
  // '<title> (<conflictCopy> YYYY-MM-DD HH:mm)'.
  conflictCopy: string
  // Marker lines around a conflict block the pull (NoteFlow Cloud or GitHub)
  // writes INTO a section both devices changed on the same lines (rendered as
  // `> <text>`). The merged text syncs to every device, so they never say
  // "this device": opening = `{time}` of the merge + `{device}` (hostname of
  // the merging computer) whose lines follow; separator = the version already
  // synced (the remote) follows; closing.
  conflictMarkers: { local: string; remote: string; end: string }
}

export interface Messages {
  tray: TrayMessages
  notifications: NotificationMessages
  dialogs: DialogMessages
  chatErrors: ChatErrorMessages
  sync: SyncMessages
}

const en: Messages = {
  tray: {
    tooltip: 'NoteFlow — quick notes',
    tooltipShortcutUnavailable: 'NoteFlow — shortcut unavailable (Ctrl+Shift+Space)',
    open: 'Open NoteFlow',
    newNote: 'New Note',
    openNotesFolder: 'Open notes folder',
    quit: 'Quit',
  },
  notifications: {
    updateDownloadedTitle: 'Update downloaded',
    updateDownloadedBody: 'Drag NoteFlow to your Applications folder to finish updating, then reopen it.',
  },
  dialogs: {
    chooseNotesFolder: 'Choose notes folder',
    exportNote: 'Export note',
    chooseDestinationFolder: 'Choose destination folder',
    exportNotes: 'Export notes',
    importNotes: 'Import notes',
    chooseMarkdownFolder: 'Choose a folder of Markdown notes',
    importNotion: 'Import Notion export',
    importGoogleKeep: 'Import Google Keep export',
    addFilesToProfile: 'Add files to your profile',
    attachFilesToChat: 'Attach files to the chat',
    linkFiles: 'Link files',
    relocateLinkedFile: 'Locate the linked file',
    linkFilterAllFiles: 'All files',
    linkFilterMarkdown: 'Markdown',
    chooseAgentFolder: 'Choose the project folder for this note',
    agentApproveCommand: 'Run this command with your tasks?',
    agentApproveCommandDetail:
      'NoteFlow will run this command in a terminal, in the project folder of the note, and hand it your tasks. Only continue if you wrote this command yourself in Settings → AI. You will be asked again if it changes.',
    agentApproveCommandConfirm: 'Run this command with your tasks',
    agentApproveUrl: 'Open this link with your tasks?',
    agentApproveUrlDetail:
      'NoteFlow will open this link with the prompt (your tasks and the text you selected) and the project folder of the note filled in. Only continue if you wrote this link yourself in Settings → AI. You will be asked again if it changes.',
    agentApproveUrlWeb: 'This is a web link: the text of the prompt — content of your notes — travels in the address to that server.',
    agentApproveUrlConfirm: 'Open this link with your tasks',
    agentApproveCancel: 'Cancel',
  },
  chatErrors: {
    quotaExceeded: "This month's NoteFlow AI allowance is used up, or what's left isn't enough for this request — try a cheaper model. It resets on the 1st of next month.",
    managedSignInAgain: 'Your NoteFlow session has expired. Sign in again from Settings → Account.',
    managedSubscriptionInactive: "NoteFlow AI needs an active subscription and yours isn't active. Check your plan in Settings → Account.",
    managedNoSession: 'NoteFlow AI needs your NoteFlow account. Sign in from Settings → Account and try again.',
    managedOffline: "Couldn't reach NoteFlow AI. Check your internet connection and try again.",
    managedKeychainLocked: "Couldn't unlock your saved NoteFlow session — your system keychain may be locked. Unlock it and try again.",
    managedServiceUnavailable: 'The NoteFlow account service is temporarily unavailable. Please try again in a moment.',
  },
  sync: {
    conflictCopy: 'conflict copy',
    conflictMarkers: {
      local: '⚠️ Sync conflict ({time}) — version from {device}:',
      remote: '⚠️ Sync conflict — version already synced:',
      end: '⚠️ End of sync conflict',
    },
  },
}

// `: Messages` forces key parity with English at compile time.
const es: Messages = {
  tray: {
    tooltip: 'NoteFlow — notas rápidas',
    tooltipShortcutUnavailable: 'NoteFlow — atajo no disponible (Ctrl+Shift+Space)',
    open: 'Abrir NoteFlow',
    newNote: 'Nueva nota',
    openNotesFolder: 'Abrir carpeta de notas',
    quit: 'Salir',
  },
  notifications: {
    updateDownloadedTitle: 'Actualización descargada',
    updateDownloadedBody: 'Arrastra NoteFlow a tu carpeta de Aplicaciones para terminar de actualizar y vuelve a abrirlo.',
  },
  dialogs: {
    chooseNotesFolder: 'Elegir carpeta de notas',
    exportNote: 'Exportar nota',
    chooseDestinationFolder: 'Elegir carpeta de destino',
    exportNotes: 'Exportar notas',
    importNotes: 'Importar notas',
    chooseMarkdownFolder: 'Elegir una carpeta de notas Markdown',
    importNotion: 'Importar exportación de Notion',
    importGoogleKeep: 'Importar exportación de Google Keep',
    addFilesToProfile: 'Añadir archivos a tu perfil',
    attachFilesToChat: 'Adjuntar archivos al chat',
    linkFiles: 'Vincular archivos',
    relocateLinkedFile: 'Localizar el archivo vinculado',
    linkFilterAllFiles: 'Todos los archivos',
    linkFilterMarkdown: 'Markdown',
    chooseAgentFolder: 'Elige la carpeta del proyecto de esta nota',
    agentApproveCommand: '¿Ejecutar este comando con tus tareas?',
    agentApproveCommandDetail:
      'NoteFlow ejecutará este comando en una terminal, en la carpeta del proyecto de la nota, y le pasará tus tareas. Continúa solo si este comando lo escribiste tú en Ajustes → IA. Se te volverá a preguntar si cambia.',
    agentApproveCommandConfirm: 'Ejecutar este comando con tus tareas',
    agentApproveUrl: '¿Abrir este enlace con tus tareas?',
    agentApproveUrlDetail:
      'NoteFlow abrirá este enlace con el prompt (tus tareas y el texto que hayas seleccionado) y la carpeta del proyecto de la nota ya rellenados. Continúa solo si este enlace lo escribiste tú en Ajustes → IA. Se te volverá a preguntar si cambia.',
    agentApproveUrlWeb: 'Es un enlace web: el texto del prompt —contenido de tus notas— viaja en la dirección hasta ese servidor.',
    agentApproveUrlConfirm: 'Abrir este enlace con tus tareas',
    agentApproveCancel: 'Cancelar',
  },
  chatErrors: {
    quotaExceeded: 'La asignación de NoteFlow AI de este mes se ha agotado, o lo que queda no basta para esta petición — prueba con un modelo más barato. Se renueva el día 1 del mes que viene.',
    managedSignInAgain: 'Tu sesión de NoteFlow ha caducado. Vuelve a iniciar sesión en Ajustes → Cuenta.',
    managedSubscriptionInactive: 'NoteFlow AI necesita una suscripción activa y la tuya no lo está. Revisa tu plan en Ajustes → Cuenta.',
    managedNoSession: 'NoteFlow AI necesita tu cuenta de NoteFlow. Inicia sesión en Ajustes → Cuenta e inténtalo de nuevo.',
    managedOffline: 'No se pudo conectar con NoteFlow AI. Comprueba tu conexión a internet e inténtalo de nuevo.',
    managedKeychainLocked: 'No se pudo desbloquear tu sesión de NoteFlow guardada — puede que el llavero del sistema esté bloqueado. Desbloquéalo e inténtalo de nuevo.',
    managedServiceUnavailable: 'El servicio de cuentas de NoteFlow no está disponible en este momento. Inténtalo de nuevo en un momento.',
  },
  sync: {
    conflictCopy: 'copia en conflicto',
    conflictMarkers: {
      local: '⚠️ Conflicto de sincronización ({time}) — versión de {device}:',
      remote: '⚠️ Conflicto de sincronización — versión ya sincronizada:',
      end: '⚠️ Fin del conflicto de sincronización',
    },
  },
}

/**
 * Resolves a persisted setting to a concrete language. For 'system' we read the
 * OS locale lazily via `getLocale` (Electron's `app.getLocale()` is only
 * reliable after `whenReady`, so the caller passes it as a thunk).
 */
export function resolveLang(setting: LanguageSetting | undefined, getLocale: () => string): Lang {
  if (setting === 'en' || setting === 'es') return setting
  return getLocale().toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function getMessages(lang: Lang): Messages {
  return lang === 'es' ? es : en
}

export function getTrayMessages(lang: Lang): TrayMessages {
  return getMessages(lang).tray
}
