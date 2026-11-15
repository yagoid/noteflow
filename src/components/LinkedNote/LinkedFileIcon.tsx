import { FileCode, FileSymlink } from 'lucide-react'
import { isMarkdownFilePath } from '../../lib/linkedNotes'

interface LinkedFileIconProps {
  /** The linked file's path: its type picks the icon. */
  path: string
  size: number
  className?: string
  'aria-label'?: string
}

/**
 * Icon of a linked note, by file type: the linked-Markdown icon for a .md/.markdown, a code
 * file for any other text file (config.json, a .yaml, a script — plain text, text mode only).
 */
export function LinkedFileIcon({ path, size, className, 'aria-label': ariaLabel }: LinkedFileIconProps) {
  const Icon = isMarkdownFilePath(path) ? FileSymlink : FileCode
  return <Icon size={size} className={className} aria-label={ariaLabel} />
}
