"use strict";
// Main-process i18n. `electron/` compiles separately to `dist-electron/` and must
// not import from `src/`, so this is a small self-contained mirror of the string
// tree. It covers every user-facing string the main process shows natively: the
// tray menu + tooltips, OS notifications, and native file-dialog titles. All of
// these are resolved at call-time from the persisted `language` setting (see
// `mainMessages()` in main.ts) so they follow the same live-switch behaviour as
// the renderer. Alarm notifications carry only user content (note title + task
// text), so there is nothing to translate there.
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLang = resolveLang;
exports.getMessages = getMessages;
exports.getTrayMessages = getTrayMessages;
const en = {
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
    },
    chatErrors: {
        quotaExceeded: "You've reached your NoteFlow AI monthly quota. It resets on the 1st of next month.",
        managedSignInAgain: 'Your NoteFlow session has expired. Sign in again from Settings → Account.',
        managedSubscriptionInactive: "NoteFlow AI needs an active subscription and yours isn't active. Check your plan in Settings → Account.",
    },
};
// `: Messages` forces key parity with English at compile time.
const es = {
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
    },
    chatErrors: {
        quotaExceeded: 'Has alcanzado tu cuota mensual de NoteFlow AI. Se renueva el día 1 del mes que viene.',
        managedSignInAgain: 'Tu sesión de NoteFlow ha caducado. Vuelve a iniciar sesión en Ajustes → Cuenta.',
        managedSubscriptionInactive: 'NoteFlow AI necesita una suscripción activa y la tuya no lo está. Revisa tu plan en Ajustes → Cuenta.',
    },
};
/**
 * Resolves a persisted setting to a concrete language. For 'system' we read the
 * OS locale lazily via `getLocale` (Electron's `app.getLocale()` is only
 * reliable after `whenReady`, so the caller passes it as a thunk).
 */
function resolveLang(setting, getLocale) {
    if (setting === 'en' || setting === 'es')
        return setting;
    return getLocale().toLowerCase().startsWith('es') ? 'es' : 'en';
}
function getMessages(lang) {
    return lang === 'es' ? es : en;
}
function getTrayMessages(lang) {
    return getMessages(lang).tray;
}
