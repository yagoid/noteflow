import { useLanguageStore } from '../stores/languageStore'

// Default names of the sections the app creates, in the UI language at the moment of
// creating them (i18n common.defaultSectionName / newSectionName). Read imperatively:
// they are used inside event handlers and store actions. A name is only chosen at
// creation — existing sections ("Note" from before, or made in another language) are
// never renamed.

/** First section of a brand-new note: "Note" / "Nota". */
export const defaultSectionName = (): string => useLanguageStore.getState().dict.common.defaultSectionName

/** A section added to a note (its rename field opens on this name): "New" / "Nueva". */
export const newSectionName = (): string => useLanguageStore.getState().dict.common.newSectionName
