// GitHub pull of root metadata (electron/githubMetadata.ts): a file this device
// already reconciled keeps the historical "remote wins"; one it never
// reconciled with the repo (first connect, lost sync-state.json) used to be
// overwritten too — losing every local group/folder/template the repo didn't
// know. Now it follows Cloud's first-pull rule (backup + union by id) and the
// result is uploaded. Plus parity with the CLI's mirror (cli/noteflow.js).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { planGithubMetadataPull } from '../../electron/githubMetadata'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

const json = (v: unknown) => JSON.stringify(v, null, 2)
const LOCAL_GROUPS = json([{ id: 'qa', name: 'QA-Grupo' }, { id: 'shared', name: 'Shared (local)' }])
const REMOTE_GROUPS = json([{ id: 'work', name: 'Work' }, { id: 'shared', name: 'Shared (remote)' }])

describe('planGithubMetadataPull — never reconciled (no cached sha)', () => {
  const first = { reconciled: false }

  it('id-keyed arrays are united (remote wins a shared id), backed up and pushed', () => {
    const d = planGithubMetadataPull('groups.json', LOCAL_GROUPS, REMOTE_GROUPS, first)
    expect(d).toEqual({
      action: 'write',
      content: json([{ id: 'work', name: 'Work' }, { id: 'shared', name: 'Shared (remote)' }, { id: 'qa', name: 'QA-Grupo' }]),
      backup: true,
      merged: true,
      push: true,
    })
  })

  it('folders.json and templates.json merge too (the QA case: remote templates = [])', () => {
    const folders = planGithubMetadataPull('folders.json', json([{ id: 'f1', name: 'QA-Carpeta', groupId: 'qa' }]), '[]', first)
    expect(folders).toEqual({ action: 'keep', push: true }) // union = the local file: nothing to write, the repo lacks it
    const templates = planGithubMetadataPull('templates.json', json([{ id: 't1', name: 'QA-Plantilla' }]), json([{ id: 't2', name: 'Other' }]), first)
    expect(templates.action).toBe('write')
    if (templates.action !== 'write') return
    expect(JSON.parse(templates.content).map((t: { id: string }) => t.id)).toEqual(['t2', 't1'])
    expect(templates.push).toBe(true)
  })

  it('remote already contains everything local has → takes the remote, nothing to push', () => {
    const local = json([{ id: 'shared', name: 'Shared (local)' }])
    const d = planGithubMetadataPull('groups.json', local, REMOTE_GROUPS, first)
    expect(d).toEqual({ action: 'write', content: REMOTE_GROUPS, backup: true, merged: true, push: false })
  })

  it('identical → keep, no push', () => {
    expect(planGithubMetadataPull('groups.json', REMOTE_GROUPS, REMOTE_GROUPS, first)).toEqual({ action: 'keep', push: false })
  })

  it('no local file → the remote, without backup or push (as before)', () => {
    expect(planGithubMetadataPull('groups.json', null, REMOTE_GROUPS, first)).toEqual({
      action: 'write', content: REMOTE_GROUPS, backup: false, merged: false, push: false,
    })
  })

  it('files that are not id arrays (ui-settings, note-order, section-colors) take the remote, local backed up', () => {
    for (const f of ['ui-settings.json', 'note-order.json', 'section-colors.json']) {
      expect(planGithubMetadataPull(f, '{"a":1}', '{"b":2}', first)).toEqual({
        action: 'write', content: '{"b":2}', backup: true, merged: false, push: false,
      })
    }
  })

  it('a malformed side can not be merged → remote wins, but the local file is backed up', () => {
    expect(planGithubMetadataPull('groups.json', 'not json', REMOTE_GROUPS, first)).toEqual({
      action: 'write', content: REMOTE_GROUPS, backup: true, merged: false, push: false,
    })
  })
})

describe('planGithubMetadataPull — reconciled before (steady state, unchanged behaviour)', () => {
  const steady = { reconciled: true }

  it('remote wins, no merge, no backup, no push', () => {
    expect(planGithubMetadataPull('groups.json', LOCAL_GROUPS, REMOTE_GROUPS, steady)).toEqual({
      action: 'write', content: REMOTE_GROUPS, backup: false, merged: false, push: false,
    })
  })

  it('identical → keep', () => {
    expect(planGithubMetadataPull('groups.json', REMOTE_GROUPS, REMOTE_GROUPS, steady)).toEqual({ action: 'keep', push: false })
  })
})

describe('CLI parity (cli/noteflow.js planGithubMetadataPull)', () => {
  it('same decision on every branch', () => {
    const files = ['groups.json', 'folders.json', 'templates.json', 'note-order.json', 'ui-settings.json']
    const locals = [LOCAL_GROUPS, null, 'garbage', REMOTE_GROUPS, '[]', json([{ id: 'shared', name: 'x' }])]
    const remotes = [REMOTE_GROUPS, '[]', LOCAL_GROUPS]
    for (const f of files) {
      for (const l of locals) {
        for (const r of remotes) {
          for (const reconciled of [false, true]) {
            expect(cli.planGithubMetadataPull(f, l, r, { reconciled })).toEqual(planGithubMetadataPull(f, l, r, { reconciled }))
          }
        }
      }
    }
  })
})
