import {
  Archive,
  BookOpen,
  Briefcase,
  Calendar,
  Code,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  House,
  Image,
  Inbox,
  Lightbulb,
  ListTodo,
  Music,
  PenLine,
  Plane,
  Rocket,
  ShoppingCart,
  Star,
  Tag,
  Target,
  Terminal,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// Curated icon set a folder can use instead of the default folder glyph (folder context
// menu → "Change icon"). `NoteFolder.icon` stores the KEY, never the lucide export name:
// keys are stable data synced in folders.json (also read by the CLI / mobile app), while
// lucide names can change between versions. Keys name the drawn object, not a meaning, so
// another client can map them to its own icon set. Order = order of the picker grid.
// Adding an icon: append a key here + its label in i18n (`common.folderIcons`, EN and ES).
// Never rename or remove a key: folders already using it would fall back to the default.
export const FOLDER_ICONS = [
  { key: 'briefcase', icon: Briefcase },
  { key: 'user', icon: User },
  { key: 'house', icon: House },
  { key: 'lightbulb', icon: Lightbulb },
  { key: 'star', icon: Star },
  { key: 'heart', icon: Heart },
  { key: 'book', icon: BookOpen },
  { key: 'graduation-cap', icon: GraduationCap },
  { key: 'file-text', icon: FileText },
  { key: 'pen', icon: PenLine },
  { key: 'code', icon: Code },
  { key: 'terminal', icon: Terminal },
  { key: 'flask', icon: FlaskConical },
  { key: 'calendar', icon: Calendar },
  { key: 'target', icon: Target },
  { key: 'list-todo', icon: ListTodo },
  { key: 'inbox', icon: Inbox },
  { key: 'archive', icon: Archive },
  { key: 'tag', icon: Tag },
  { key: 'image', icon: Image },
  { key: 'users', icon: Users },
  { key: 'wallet', icon: Wallet },
  { key: 'cart', icon: ShoppingCart },
  { key: 'plane', icon: Plane },
  { key: 'globe', icon: Globe },
  { key: 'rocket', icon: Rocket },
  { key: 'music', icon: Music },
] as const satisfies readonly { key: string; icon: LucideIcon }[]

export type FolderIconKey = (typeof FOLDER_ICONS)[number]['key']

const ICONS_BY_KEY: ReadonlyMap<string, LucideIcon> = new Map(FOLDER_ICONS.map(({ key, icon }) => [key, icon]))

/**
 * The lucide icon of a folder's `icon` key, or null for the default folder glyph: when
 * unset, and also for an unknown key (written by a newer client), so it degrades gracefully.
 */
export function resolveFolderIcon(key: string | undefined | null): LucideIcon | null {
  if (!key) return null
  return ICONS_BY_KEY.get(key) ?? null
}
