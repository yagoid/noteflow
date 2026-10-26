// Text helpers shared by the sidebar note rows (Sidebar.tsx) and the collapsed-group
// peek (GroupPeek.tsx), so both show dates and search highlights the same way.
import { isToday, isYesterday } from 'date-fns'
import { escapeRegExp } from '../../lib/searchUtils'
import { formatDate } from '../../i18n/formatDate'
import { tf } from '../../i18n/format'
import type { Messages } from '../../i18n'

/** Relative note date: time today, "Yesterday", else month + day. */
export function formatNoteDate(iso: string, t: Messages): string {
  const d = new Date(iso)
  if (isToday(d)) return formatDate(d, 'HH:mm')
  if (isYesterday(d)) return t.sidebar.yesterday
  return formatDate(d, 'MMM d')
}

/** Tooltip for a note that auto-deletes: "expires in …". */
export function formatExpiry(iso: string, t: Messages): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return t.sidebar.expiringSoon
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return tf(t.sidebar.expiresInMinutes, { m: Math.ceil(diffMs / (1000 * 60)) })
  if (diffH < 24) return tf(t.sidebar.expiresInHours, { h: diffH })
  return tf(t.sidebar.expiresInDays, { d: Math.floor(diffH / 24) })
}

/** `text` with every case-insensitive occurrence of `query` wrapped in a <mark>. */
export function renderHighlightedText(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return text
  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return text

  return parts.map((part, index) => (
    index % 2 === 1
      ? (
        <mark key={`${part}-${index}`} className="bg-text/15 text-text rounded px-[1px]">
          {part}
        </mark>
      )
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}
