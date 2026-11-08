import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { NoteGroup, NoteFolder, GroupColor } from '../types'
import { useNotesStore } from './notesStore'

interface GroupsState {
  groups: NoteGroup[]
  folders: NoteFolder[]
  collapsedGroupIds: Set<string>
  collapsedFolderIds: Set<string>
  noteOrder: Record<string, string[]>  // contextKey → ordered note IDs

  loadGroups: () => Promise<void>
  createGroup: (name: string, color: GroupColor) => Promise<NoteGroup>
  renameGroup: (id: string, name: string) => Promise<void>
  setGroupColor: (id: string, color: GroupColor) => Promise<void>
  toggleGroupArchived: (id: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  reorderGroups: (orderedIds: string[]) => Promise<void>
  toggleGroupCollapsed: (id: string) => void
  setContextNoteOrder: (contextKey: string, ids: string[]) => Promise<void>

  createFolder: (groupId: string, name: string) => Promise<NoteFolder>
  renameFolder: (id: string, name: string) => Promise<void>
  /** Sets a folder's icon key (lib/folderIcons.ts); null drops the field (default glyph). */
  setFolderIcon: (id: string, icon: string | null) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  toggleFolderCollapsed: (id: string) => void
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  folders: [],
  collapsedGroupIds: new Set(),
  collapsedFolderIds: new Set(),
  noteOrder: {},

  loadGroups: async () => {
    const [raw, rawFolders, uiState, rawNoteOrder] = await Promise.all([
      window.noteflow.getGroups(),
      window.noteflow.getFolders(),
      window.noteflow.getUiState(),
      window.noteflow.getNoteOrder(),
    ])
    const collapsed = new Set<string>(uiState.collapsedGroupIds ?? [])
    const collapsedFolders = new Set<string>(uiState.collapsedFolderIds ?? [])
    set({
      groups: raw as NoteGroup[],
      folders: rawFolders as NoteFolder[],
      collapsedGroupIds: collapsed,
      collapsedFolderIds: collapsedFolders,
      noteOrder: (rawNoteOrder as Record<string, string[]>) ?? {},
    })
  },

  setContextNoteOrder: async (contextKey, ids) => {
    const updated = { ...get().noteOrder, [contextKey]: ids }
    set({ noteOrder: updated })
    await window.noteflow.setNoteOrder(updated)
  },

  createGroup: async (name, color) => {
    const { groups } = get()
    const maxOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.order)) : -1
    const newGroup: NoteGroup = {
      id: nanoid(8),
      name,
      color,
      order: maxOrder + 1,
    }
    const updated = [...groups, newGroup]
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
    return newGroup
  },

  renameGroup: async (id, name) => {
    const updated = get().groups.map((g) => (g.id === id ? { ...g, name } : g))
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  setGroupColor: async (id, color) => {
    const updated = get().groups.map((g) => (g.id === id ? { ...g, color } : g))
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  toggleGroupArchived: async (id) => {
    const updated = get().groups.map((g) => (g.id === id ? { ...g, archived: !g.archived } : g))
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  deleteGroup: async (id) => {
    const updated = get().groups.filter((g) => g.id !== id)
    // Drop the group's folders too
    const removedFolderIds = new Set(get().folders.filter((f) => f.groupId === id).map((f) => f.id))
    const updatedFolders = get().folders.filter((f) => f.groupId !== id)

    const nextCollapsed = new Set(get().collapsedGroupIds)
    nextCollapsed.delete(id)
    const nextCollapsedFolders = new Set(get().collapsedFolderIds)
    for (const fid of removedFolderIds) nextCollapsedFolders.delete(fid)

    set({
      groups: updated,
      folders: updatedFolders,
      collapsedGroupIds: nextCollapsed,
      collapsedFolderIds: nextCollapsedFolders,
    })
    await window.noteflow.setUiState({
      collapsedGroupIds: [...nextCollapsed],
      collapsedFolderIds: [...nextCollapsedFolders],
    })

    const notesStore = useNotesStore.getState()
    const notesToUngroup = notesStore.notes.filter((n) => n.group === id)
    await Promise.all(notesToUngroup.map((n) => notesStore.updateNote(n.id, { group: undefined, folder: undefined })))

    await window.noteflow.setGroups(updated)
    await window.noteflow.setFolders(updatedFolders)
  },

  reorderGroups: async (orderedIds) => {
    const byId = new Map(get().groups.map((g) => [g.id, g]))
    // Reassign order by position; append any groups missing from the list (safety)
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((g): g is NoteGroup => Boolean(g))
    for (const g of get().groups) {
      if (!orderedIds.includes(g.id)) reordered.push(g)
    }
    const updated = reordered.map((g, index) => ({ ...g, order: index }))
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  toggleGroupCollapsed: (id) => {
    set((s) => {
      const next = new Set(s.collapsedGroupIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      window.noteflow.setUiState({ collapsedGroupIds: [...next] })
      return { collapsedGroupIds: next }
    })
  },

  createFolder: async (groupId, name) => {
    const { folders } = get()
    const siblings = folders.filter((f) => f.groupId === groupId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map((f) => f.order)) : -1
    const newFolder: NoteFolder = {
      id: nanoid(8),
      name,
      groupId,
      order: maxOrder + 1,
    }
    const updated = [...folders, newFolder]
    set({ folders: updated })
    await window.noteflow.setFolders(updated)
    return newFolder
  },

  renameFolder: async (id, name) => {
    const updated = get().folders.map((f) => (f.id === id ? { ...f, name } : f))
    set({ folders: updated })
    await window.noteflow.setFolders(updated)
  },

  setFolderIcon: async (id, icon) => {
    const updated = get().folders.map((f) => {
      if (f.id !== id) return f
      if (icon) return { ...f, icon }
      // Back to the default: drop the key (folders.json never carries `icon: null`).
      const next = { ...f }
      delete next.icon
      return next
    })
    set({ folders: updated })
    await window.noteflow.setFolders(updated)
  },

  deleteFolder: async (id) => {
    const updated = get().folders.filter((f) => f.id !== id)
    const nextCollapsed = new Set(get().collapsedFolderIds)
    nextCollapsed.delete(id)

    set({ folders: updated, collapsedFolderIds: nextCollapsed })
    await window.noteflow.setUiState({ collapsedFolderIds: [...nextCollapsed] })

    // Notes inside this folder fall back to the group root (keep their group)
    const notesStore = useNotesStore.getState()
    const notesInFolder = notesStore.notes.filter((n) => n.folder === id)
    await Promise.all(notesInFolder.map((n) => notesStore.updateNote(n.id, { folder: undefined })))

    await window.noteflow.setFolders(updated)
  },

  toggleFolderCollapsed: (id) => {
    set((s) => {
      const next = new Set(s.collapsedFolderIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      window.noteflow.setUiState({ collapsedFolderIds: [...next] })
      return { collapsedFolderIds: next }
    })
  },
}))
