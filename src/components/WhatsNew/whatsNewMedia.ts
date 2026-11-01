import { mediaFileName, resolveSlideMedia, type SlideMedia } from '../../lib/whatsNew'

// Clips of the tour: src/assets/whats-new/<id>[.<lang>].webm (+ optional .png poster).
// Eager `?url` glob: Vite emits each file as an asset and hands back its URL, and a
// missing file (or folder) simply isn't in the map — the build never breaks and the
// slide draws its animated fallback instead. Served from 'self' (CSP media-src).
const FILES = import.meta.glob('../../assets/whats-new/*.{webm,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [mediaFileName(path), url]),
)

/** Clip + poster of a slide for the UI language (falls back to the neutral file, then null). */
export function getSlideMedia(id: string, lang: string): SlideMedia {
  return resolveSlideMedia(id, lang, BY_NAME)
}

/** Whether the slide has a bundled clip for this language (or a neutral one). */
export function hasClip(id: string, lang: string): boolean {
  return getSlideMedia(id, lang).video !== null
}
