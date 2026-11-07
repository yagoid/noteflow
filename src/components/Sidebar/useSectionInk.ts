import { useMemo } from 'react'
import { useThemeStore } from '../../stores/themeStore'
import { resolveSectionInk } from '../../lib/sectionInk'
import type { GroupColor } from '../../types'

/**
 * Readable ink on the solid cell of the open section in a sidebar section map (same
 * rule as the editor's active tab). Recomputed when the theme or its accent changes,
 * since resolveSectionInk reads the live theme vars. Undefined without an open section.
 */
export function useSectionInk(color: GroupColor | null, aiHidden: boolean): string | undefined {
  const themeId = useThemeStore((s) => s.activeThemeId)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  return useMemo(
    () => (color ? resolveSectionInk(color, aiHidden) : undefined),
    // themeId/accentOverride: the vars it reads change with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, aiHidden, themeId, accentOverride],
  )
}
