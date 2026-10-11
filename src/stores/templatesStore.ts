import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { NoteTemplate, NoteSection } from '../types'

interface TemplatesState {
  templates: NoteTemplate[]

  loadTemplates: () => Promise<void>
  createTemplate: (data: { name: string; title: string; sections: NoteSection[] }) => Promise<NoteTemplate>
  renameTemplate: (id: string, name: string) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],

  loadTemplates: async () => {
    set({ templates: (await window.noteflow.getTemplates()) as NoteTemplate[] })
  },

  createTemplate: async ({ name, title, sections }) => {
    const newTemplate: NoteTemplate = {
      id: nanoid(8),
      name,
      title,
      // A template is a blueprint, not a note: don't persist the source sections'
      // creation dates (notes created from it stamp their own — createPopulatedNote).
      sections: sections.map(({ created: _created, ...rest }) => rest),
      createdAt: new Date().toISOString(),
    }
    const updated = [...get().templates, newTemplate]
    set({ templates: updated })
    await window.noteflow.setTemplates(updated)
    return newTemplate
  },

  renameTemplate: async (id, name) => {
    const updated = get().templates.map((t) => (t.id === id ? { ...t, name } : t))
    set({ templates: updated })
    await window.noteflow.setTemplates(updated)
  },

  deleteTemplate: async (id) => {
    const updated = get().templates.filter((t) => t.id !== id)
    set({ templates: updated })
    await window.noteflow.setTemplates(updated)
  },
}))
