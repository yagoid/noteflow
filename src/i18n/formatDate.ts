import { format } from 'date-fns'
import { useLanguageStore } from '../stores/languageStore'
import type { Messages } from './en'

/**
 * Locale-aware wrapper around date-fns' `format()`. Reads the active date-fns
 * locale from the language store so month/day names follow the UI language.
 *
 * Not a hook — it reads the store imperatively at call time. Components that call
 * it already subscribe to the language (via `useT()`), so they re-render on a
 * language switch and re-run this with the new locale.
 */
export function formatDate(date: Date | number, fmt: string): string {
  const locale = useLanguageStore.getState().dateLocale
  return format(date, fmt, locale ? { locale } : undefined)
}

/** A shared date pattern of the UI language (i18n `common.dateFormats`). */
export type DateStyle = keyof Messages['common']['dateFormats']

/**
 * `formatDate` with one of the shared patterns: the locale gives the month names,
 * the pattern the ORDER ("Nov 20" / "20 nov"). Use it instead of a literal 'MMM d'
 * in the UI — a fixed pattern keeps the English order in every language.
 */
export function formatDateStyle(date: Date | number, style: DateStyle): string {
  return formatDate(date, useLanguageStore.getState().dict.common.dateFormats[style])
}
