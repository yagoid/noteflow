// GitHub Sync: per-file MERGE of a note folder on the pull's conflict path
// (QA B3) — the GitHub counterpart of the Cloud three-way pull. Instead of the
// remote version winning the folder and the local one going to a conflict
// copy, each file is reconciled against its base (the git blob sha this device
// last reconciled, SyncState.shas): a section both sides changed is merged
// line by line (mergeSectionText — diff3 with the base blob's content, fetched
// by sha from GitHub, else a two-way union; overlapping edits keep both
// versions between ⚠️ markers) and note.md's frontmatter with mergeAnchors.
// Pure: it adapts the git-sha view to Cloud's planThreeWayDir (synthetic seqs:
// 1 = "still the base", 2 = "moved") so both backends share ONE planner.

import {
  planThreeWayDir,
  hashForBase,
  relistAnchorSections,
  UNKNOWN_BASE_HASH,
  type SectionConflictLabels,
  type ThreeWayRemoteRow,
} from './cloudSyncLogic'
import type { CloudBase } from './syncState'
import { NOTE_MD } from './noteFormat'

/** One file of the folder, seen from the three sides. */
export interface GithubMergeFile {
  path: string
  /** Cached (base) blob sha; undefined = unknown. */
  base: string | undefined
  /** GitHub's version now (null = absent). */
  remote: { sha: string; content: string } | null
  /** Local content (null = absent) and its blob sha. */
  local: string | null
  localSha: string | null
  /** Content of the base blob (GET git/blobs/<base>), when it was fetched. */
  baseContent?: string | null
}

export interface GithubDirMerge {
  /** Files to write — sections first, note.md last. */
  writes: Array<{ relPath: string; content: string }>
  /** Local files to remove. */
  removes: string[]
  /**
   * Section FILENAMES deleted on GitHub but edited here since their base: the
   * deletion is applied and the local version kept in a conflict copy holding
   * only them (the behaviour of the copy path, kept for this case).
   */
  copySections: string[]
  /** Section FILENAMES merged WITH conflict blocks (both versions in the note). */
  conflictMarkerSections: string[]
  /** relPath → content of every local '.md' of the folder once applied. */
  final: Record<string, string>
}

/**
 * The merge plan of a conflicting GitHub note folder, or null when it can't
 * be merged — the anchor is missing on a side, encrypted or unreadable (both
 * changed), or a section is not mergeable: the caller then keeps the
 * historical path (remote folder wholesale + conflict copy of the local one).
 */
export function planGithubDirMerge(o: {
  dir: string
  files: readonly GithubMergeFile[]
  labels?: SectionConflictLabels
  nowIso: string
}): GithubDirMerge | null {
  const anchorRel = `${o.dir}/${NOTE_MD}`
  const prefix = `${o.dir}/`
  const files = o.files.filter((f) => f.path.startsWith(prefix) && f.path.endsWith('.md'))
  const anchor = files.find((f) => f.path === anchorRel)
  if (!anchor || anchor.local === null || anchor.remote === null) return null

  // A section deleted on GitHub that this device edited since its base: the
  // deletion wins in the note, the local text goes to a copy (planner sees it as gone here too).
  const deletedRemotely = files.filter(
    (f) => f.path !== anchorRel && f.base !== undefined && f.remote === null && f.local !== null && f.localSha !== f.base,
  )
  const goneHere = new Set(deletedRemotely.map((f) => f.path))

  const local: Record<string, string> = {}
  const bases: Record<string, CloudBase> = {}
  const baseText = new Map<string, string>()
  const remote: ThreeWayRemoteRow[] = []
  for (const f of files) {
    const localContent = goneHere.has(f.path) ? null : f.local
    if (localContent !== null) local[f.path] = localContent
    if (f.base !== undefined) {
      let hash = UNKNOWN_BASE_HASH
      if (typeof f.baseContent === 'string') {
        hash = hashForBase(f.path, f.baseContent)
        baseText.set(f.path, f.baseContent)
      } else if (f.local !== null && f.localSha === f.base) {
        hash = hashForBase(f.path, f.local)
      } else if (f.remote !== null && f.remote.sha === f.base) {
        hash = hashForBase(f.path, f.remote.content)
      }
      bases[f.path] = { seq: 1, hash }
    } else {
      bases[f.path] = { seq: 1, hash: UNKNOWN_BASE_HASH }
    }
    if (f.remote !== null) {
      const atBase = f.base !== undefined && f.remote.sha === f.base
      remote.push({ relPath: f.path, seq: atBase ? 1 : 2, content: f.remote.content, updatedAtMs: 0 })
    } else if (f.base !== undefined) {
      remote.push({ relPath: f.path, seq: 2, content: null, updatedAtMs: 0 }) // deleted on GitHub
    }
  }

  const plan = planThreeWayDir({
    dir: o.dir,
    local,
    remote,
    bases,
    pendingUpserts: new Set(),
    staleUpserts: new Set(),
    copiedUpserts: new Set(),
    pendingDeletes: new Set(),
    baseContent: (rel, hash) => {
      const text = baseText.get(rel)
      return text !== undefined && hashForBase(rel, text) === hash ? text : null
    },
    conflictLabels: o.labels,
    nowIso: o.nowIso,
  })
  if (plan.copyWhole || plan.copySections.length > 0) return null

  const final: Record<string, string> = {}
  for (const f of files) if (f.local !== null) final[f.path] = f.local
  const removes = [...plan.removes, ...deletedRemotely.map((f) => f.path)]
  for (const rel of removes) delete final[rel]
  for (const w of plan.writes) final[w.relPath] = w.content

  // A section the local note.md lists whose file stays here must stay listed:
  // e.g. deleted on GitHub, edited here and re-created there by this device's
  // own (unconditional) PUT before the anchor's merge — its file is then
  // "unchanged" (local = base = remote) and the merged anchor, GitHub's, does
  // not list it. Unlisted, the next folder write would delete it.
  let writes = plan.writes
  const onDisk = new Set(Object.keys(final).filter((rel) => rel !== anchorRel).map((rel) => rel.slice(prefix.length)))
  if (onDisk.size > 0) {
    const relisted = relistAnchorSections(final[anchorRel], anchor.local, onDisk, o.nowIso)
    if (relisted === null) return null // unreadable / encrypted: the conflict copy instead
    if (relisted !== final[anchorRel]) {
      final[anchorRel] = relisted
      writes = [...writes.filter((w) => w.relPath !== anchorRel), ...(relisted !== anchor.local ? [{ relPath: anchorRel, content: relisted }] : [])]
    }
  }
  return {
    writes,
    removes,
    copySections: deletedRemotely.map((f) => f.path.slice(prefix.length)),
    conflictMarkerSections: plan.conflictMarkerSections,
    final,
  }
}
