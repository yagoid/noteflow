/** Normalize a string: lowercase + strip diacritical marks (accents) */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildSearchRegex(
  query: string,
  opts: { caseSensitive: boolean } = { caseSensitive: false },
): RegExp | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  const flags = opts.caseSensitive ? 'g' : 'gi'
  try {
    return new RegExp(escapeRegExp(trimmed), flags)
  } catch {
    return null
  }
}
