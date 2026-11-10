"use strict";
// Pure helpers for the notes-dir watcher (startNotesWatcher in main.ts).
// Covered by tests/electron/notesWatchFilter.test.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROUPS_METADATA_FILES = void 0;
exports.isGroupsMetadataFile = isGroupsMetadataFile;
/**
 * Root-level metadata files that groupsStore.loadGroups() reads. An external
 * write to any of them (the CLI creating/renaming/deleting a group or folder)
 * must reach the renderer, or its next group action would rewrite the whole
 * list from memory and undo it.
 */
exports.GROUPS_METADATA_FILES = ['groups.json', 'folders.json', 'note-order.json'];
/**
 * Is this watcher path (relative to the notes dir, forward slashes) one of the
 * groups metadata files? Only exact root-level names match: a temp file of an
 * atomic tmp+rename write is ignored, and the final rename reports the real name.
 */
function isGroupsMetadataFile(rel) {
    return exports.GROUPS_METADATA_FILES.includes(rel);
}
