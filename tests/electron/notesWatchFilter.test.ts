import { describe, it, expect } from 'vitest'
import { isGroupsMetadataFile, GROUPS_METADATA_FILES } from '../../electron/notesWatchFilter'

describe('isGroupsMetadataFile', () => {
  it('matches the three files loadGroups reads', () => {
    expect(GROUPS_METADATA_FILES).toEqual(['groups.json', 'folders.json', 'note-order.json'])
    for (const f of GROUPS_METADATA_FILES) expect(isGroupsMetadataFile(f)).toBe(true)
  })

  it('ignores other root metadata files', () => {
    for (const f of ['section-colors.json', 'templates.json', 'snippets.json', 'ui-settings.json', 'README.md']) {
      expect(isGroupsMetadataFile(f)).toBe(false)
    }
  })

  it('ignores temp files of atomic writes and nested paths', () => {
    expect(isGroupsMetadataFile('groups.json.tmp')).toBe(false)
    expect(isGroupsMetadataFile('.groups.json.123.tmp')).toBe(false)
    expect(isGroupsMetadataFile('some-note/groups.json')).toBe(false)
    expect(isGroupsMetadataFile('Groups.json')).toBe(false)
    expect(isGroupsMetadataFile('')).toBe(false)
  })
})
