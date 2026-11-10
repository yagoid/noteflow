// Pure helpers for the notes-dir watcher (startNotesWatcher in main.ts).
// Covered by tests/electron/notesWatchFilter.test.ts.

/**
 * Root-level metadata files that groupsStore.loadGroups() reads. An external
 * write to any of them (the CLI creating/renaming/deleting a group or folder)
 * must reach the renderer, or its next group action would rewrite the whole
 * list from memory and undo it.
 */
export const GROUPS_METADATA_FILES = ['groups.json', 'folders.json', 'note-order.json'] as const

/**
 * Is this watcher path (relative to the notes dir, forward slashes) one of the
 * groups metadata files? Only exact root-level names match: a temp file of an
 * atomic tmp+rename write is ignored, and the final rename reports the real name.
 */
export function isGroupsMetadataFile(rel: string): boolean {
  return (GROUPS_METADATA_FILES as readonly string[]).includes(rel)
}
